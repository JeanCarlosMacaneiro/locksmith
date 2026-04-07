import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

const REQUIRED_DELAYS: Record<string, number> = {
  patch: 3,
  minor: 7,
  major: 30,
};

function parseDays(value: string | undefined): number {
  if (!value) return 0;
  const match = value.match(/^(\d+)\s*(day|days)?$/);
  return match ? parseInt(match[1] ?? "0") : 0;
}

export async function checkRenovate(projectPath: string): Promise<CheckResult> {
  const paths = [
    join(projectPath, "renovate.json"),
    join(projectPath, "renovate.json5"),
    join(projectPath, ".github/renovate.json"),
  ];

  const found = paths.find(existsSync);

  if (!found) {
    return {
      name: "renovate.json",
      status: "warn",
      message: "renovate.json no encontrado — release delay no configurado",
      fixable: true,
      fix: async () => {
        const { applyRenovate } = await import("../fixer/apply");
        await applyRenovate(projectPath);
      },
      hint: [
        "Renovate es un bot que abre PRs automáticamente cuando hay nuevas versiones de tus dependencias.",
        "Sin este archivo, las actualizaciones no tienen período de espera y pueden introducir paquetes maliciosos.",
        "",
        "Paso 1 — Crear el archivo de configuración:",
        "  $ locksmith --fix",
        "",
        "Paso 2 — Instalar Renovate en tu repositorio (solo una vez por organización):",
        "  → GitHub:    https://github.com/apps/renovate",
        "  → GitLab:    https://docs.renovatebot.com/modules/platform/gitlab/",
        "  → Bitbucket: https://docs.renovatebot.com/modules/platform/bitbucket/",
        "",
        "Una vez instalado, Renovate leerá el renovate.json y abrirá PRs respetando",
        "los tiempos de espera configurados (patch: 3d · minor: 7d · major: 30d).",
      ],
    };
  }

  const config = JSON.parse(readFileSync(found, "utf-8"));
  const rules: any[] = config.packageRules ?? [];
  const issues: string[] = [];

  for (const [type, minDays] of Object.entries(REQUIRED_DELAYS)) {
    const rule = rules.find((r) => r.matchUpdateTypes?.includes(type));

    if (!rule) {
      issues.push(`falta regla para '${type}'`);
      continue;
    }

    const days = parseDays(rule.minimumReleaseAge);
    if (days < minDays) {
      issues.push(`${type}: ${days}d (mínimo ${minDays}d)`);
    }
  }

  if (issues.length > 0) {
    return {
      name: "renovate.json",
      status: "error",
      message: `Release delay insuficiente → ${issues.join(" | ")}`,
      fixable: true,
      hint: [
        "El 'minimumReleaseAge' define cuántos días debe esperar Renovate antes de abrir un PR.",
        "Esto da tiempo para detectar si una nueva versión es maliciosa antes de que entre a tu proyecto.",
        "",
        "Valores requeridos por política de seguridad:",
        "  patch  → mínimo 3 días   (ej: corrección de bug, riesgo bajo)",
        "  minor  → mínimo 7 días   (ej: nueva funcionalidad, riesgo medio)",
        "  major  → mínimo 30 días  (ej: cambio breaking, riesgo alto)",
        "",
        "Para corregir automáticamente con los valores correctos:",
        "  $ locksmith --fix",
        "",
        "O edita manualmente tu renovate.json:",
        `  { "matchUpdateTypes": ["patch"], "minimumReleaseAge": "3 days", "automerge": false }`,
        `  { "matchUpdateTypes": ["minor"], "minimumReleaseAge": "7 days", "automerge": false }`,
        `  { "matchUpdateTypes": ["major"], "minimumReleaseAge": "30 days", "automerge": false }`,
      ],
    };
  }

  return {
    name: "renovate.json",
    status: "ok",
    message: "Release delay: patch 3d · minor 7d · major 30d",
    hint: [
      "Renovate abrirá PRs automáticamente cuando haya actualizaciones disponibles.",
      "Cada PR esperará el tiempo configurado antes de poder mergearse:",
      "  patch  → 3 días   → requiere aprobación manual",
      "  minor  → 7 días   → requiere aprobación manual",
      "  major  → 30 días  → requiere aprobación manual",
      "",
      "Para actualizar una dependencia manualmente sin esperar a Renovate:",
      "  $ pnpm update <paquete>          → actualiza a la última versión permitida",
      "  $ pnpm update <paquete> --latest → actualiza ignorando rangos de versión",
      "  $ pnpm add <paquete>@<version>   → instala una versión específica",
    ],
  };
}
