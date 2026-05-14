import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult, ProjectType } from "../types";

const PNPM_REGEX = /^pnpm@\d+\.\d+\.\d+$/;
const BUN_REGEX  = /^bun@\d+\.\d+\.\d+$/;

export async function checkPackageManager(projectPath: string, type: ProjectType = "node"): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { name: "packageManager", status: "warn", message: "package.json no encontrado" };
  }

  const pkg   = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const field = (pkg.packageManager ?? "") as string;

  // Bun type: packageManager: "bun@..." is expected (Option B — bun runtime, pnpm packages)
  if (type === "bun") {
    if (BUN_REGEX.test(field)) return { name: "packageManager", status: "ok", message: `Bun runtime fijado: ${field}` };
    if (!field) {
      return {
        name: "packageManager",
        status: "warn",
        message: 'Campo "packageManager" ausente en proyecto Bun',
        fixable: true,
        fix: async () => { const { applyPackageManager } = await import("../fixer/apply"); await applyPackageManager(projectPath); },
      };
    }
  }

  // npm/yarn: must migrate to pnpm
  if (type === "npm" || type === "yarn") {
    if (PNPM_REGEX.test(field)) return { name: "packageManager", status: "ok", message: `Versión fijada: ${field}` };
    return {
      name: "packageManager",
      status: "error",
      message: `Proyecto usa ${type} — se requiere pnpm@11+ para máxima seguridad`,
      fixable: true,
      fix: async () => { const { migrateToPnpm } = await import("../fixer/migrate-to-pnpm"); await migrateToPnpm(projectPath); },
      hint: ["Ejecuta locksmith --fix para migrar automáticamente a pnpm 11"],
    };
  }

  // node/electron: require pnpm@X.Y.Z
  if (!field) {
    return {
      name: "packageManager",
      status: "warn",
      message: 'Campo "packageManager" ausente — versión de pnpm no fijada',
      fixable: true,
      fix: async () => { const { applyPackageManager } = await import("../fixer/apply"); await applyPackageManager(projectPath); },
    };
  }

  if (!PNPM_REGEX.test(field)) {
    return {
      name: "packageManager",
      status: "error",
      message: `Formato inválido o PM incorrecto: "${field}" — debe ser "pnpm@X.Y.Z"`,
      fixable: true,
      fix: async () => { const { applyPackageManager } = await import("../fixer/apply"); await applyPackageManager(projectPath); },
    };
  }

  return { name: "packageManager", status: "ok", message: `Versión fijada: ${field}` };
}
