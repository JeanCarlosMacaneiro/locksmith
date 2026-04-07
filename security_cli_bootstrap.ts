#!/usr/bin/env bun
/**
 * Bootstrap: locksmith CLI
 * Ejecutar: bun bootstrap.ts
 * Crea toda la estructura del proyecto en ./locksmith/
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = "./locksmith";

function write(path: string, content: string) {
  const full = join(ROOT, path);
  const dir = full.substring(0, full.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, content.trimStart());
  console.log(`  ✓ ${path}`);
}

console.log("\n🔐 Generando locksmith...\n");

// ─── package.json ────────────────────────────────────────────────────────────
write("package.json", `
{
  "name": "locksmith",
  "version": "1.0.0",
  "description": "Security policy checker for Node/Bun projects using pnpm",
  "type": "module",
  "bin": {
    "locksmith": "./bin/cli.ts"
  },
  "scripts": {
    "dev": "bun run ./bin/cli.ts",
    "build": "bun build ./bin/cli.ts --outdir ./dist --target node --minify",
    "test": "bun test",
    "lint": "bunx tsc --noEmit"
  },
  "dependencies": {
    "picocolors": "^1.1.0",
    "yargs": "^17.7.2"
  },
  "devDependencies": {
    "@types/yargs": "^17.0.32",
    "bun-types": "latest",
    "typescript": "^5.4.5"
  }
}
`);

// ─── tsconfig.json ───────────────────────────────────────────────────────────
write("tsconfig.json", `
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["bin", "src"]
}
`);

// ─── bin/cli.ts ──────────────────────────────────────────────────────────────
write("bin/cli.ts", `
#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runAllChecks } from "../src/checks/index";
import type { RunOptions } from "../src/types";

yargs(hideBin(process.argv))
  .scriptName("locksmith")
  .usage("$0 [path] [options]")
  .command(
    "$0 [path]",
    "Analiza políticas de seguridad del proyecto",
    (y) =>
      y
        .positional("path", {
          describe: "Ruta del proyecto a analizar",
          type: "string",
          default: process.cwd(),
        })
        .option("fix", {
          type: "boolean",
          description: "Aplica correcciones automáticas",
          default: false,
        })
        .option("report", {
          type: "string",
          choices: ["json", "markdown"] as const,
          description: "Exporta reporte en el formato indicado",
        })
        .option("strict", {
          type: "boolean",
          description: "Falla con exit 1 si hay advertencias",
          default: false,
        }),
    async (argv) => {
      const opts: RunOptions = {
        projectPath: argv.path as string,
        fix: argv.fix,
        report: argv.report as "json" | "markdown" | undefined,
        strict: argv.strict,
      };
      await runAllChecks(opts);
    }
  )
  .help()
  .alias("h", "help")
  .version()
  .alias("v", "version")
  .parse();
`);

// ─── src/types.ts ────────────────────────────────────────────────────────────
write("src/types.ts", `
export interface CheckResult {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  fixable?: boolean;
  fix?: () => Promise<void>;
}

export interface ProjectInfo {
  valid: boolean;
  type: "node" | "bun" | "unknown";
  name: string;
  version: string;
  hasBunLockb: boolean;
  hasPackageJson: boolean;
}

export interface RunOptions {
  projectPath: string;
  fix: boolean;
  report?: "json" | "markdown";
  strict: boolean;
}
`);

// ─── src/checks/index.ts ─────────────────────────────────────────────────────
write("src/checks/index.ts", `
import pc from "picocolors";
import { detectProject } from "./detect-project";
import { checkPnpm } from "./check-pnpm";
import { checkNpmrc } from "./check-npmrc";
import { checkLockfile } from "./check-lockfile";
import { checkRenovate } from "./check-renovate";
import { checkAudit } from "./check-audit";
import { checkBuiltDeps } from "./check-built-deps";
import { checkOnlyAllow } from "./check-only-allow";
import { printReport } from "../reporter/console";
import { exportReport } from "../reporter/export";
import { applyFixes } from "../fixer/apply";
import type { RunOptions } from "../types";

export async function runAllChecks(opts: RunOptions) {
  console.log(pc.bold("\\n🔐 locksmith\\n"));
  console.log(pc.dim(\`   Analizando: \${opts.projectPath}\\n\`));

  const project = await detectProject(opts.projectPath);

  if (!project.valid) {
    console.error(pc.red("✗ No se encontró package.json en este directorio."));
    process.exit(1);
  }

  console.log(
    pc.green(\`✓ Proyecto: \${pc.bold(project.name)} [\${project.type}]\\n\`)
  );

  const results = await Promise.all([
    checkPnpm(opts.projectPath),
    checkNpmrc(opts.projectPath),
    checkLockfile(opts.projectPath),
    checkRenovate(opts.projectPath),
    checkBuiltDeps(opts.projectPath),
    checkOnlyAllow(opts.projectPath),
    checkAudit(opts.projectPath),
  ]);

  printReport(results);

  if (opts.fix) {
    await applyFixes(results, opts.projectPath);
  }

  if (opts.report) {
    await exportReport(results, opts.report, opts.projectPath);
  }

  const hasErrors = results.some((r) => r.status === "error");
  const hasWarnings = results.some((r) => r.status === "warn");

  if (hasErrors || (opts.strict && hasWarnings)) {
    process.exit(1);
  }

  process.exit(0);
}
`);

// ─── src/checks/detect-project.ts ────────────────────────────────────────────
write("src/checks/detect-project.ts", `
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { ProjectInfo } from "../types";

export async function detectProject(projectPath: string): Promise<ProjectInfo> {
  const pkgPath = join(projectPath, "package.json");
  const hasBunLockb = existsSync(join(projectPath, "bun.lockb"));
  const hasPackageJson = existsSync(pkgPath);

  if (!hasPackageJson) {
    return { valid: false, type: "unknown", name: "", version: "", hasBunLockb, hasPackageJson };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const type = hasBunLockb ? "bun" : "node";

  return {
    valid: true,
    type,
    name: pkg.name ?? "unnamed",
    version: pkg.version ?? "0.0.0",
    hasBunLockb,
    hasPackageJson,
  };
}
`);

// ─── src/checks/check-pnpm.ts ────────────────────────────────────────────────
write("src/checks/check-pnpm.ts", `
import { $ } from "bun";
import type { CheckResult } from "../types";

const MIN_VERSION = 8;

export async function checkPnpm(_projectPath: string): Promise<CheckResult> {
  try {
    const result = await $\`pnpm --version\`.text();
    const version = result.trim();
    const major = parseInt(version.split(".")[0] ?? "0");

    if (major < MIN_VERSION) {
      return {
        name: "pnpm version",
        status: "warn",
        message: \`pnpm \${version} instalado — se recomienda v\${MIN_VERSION}+\`,
      };
    }

    return {
      name: "pnpm version",
      status: "ok",
      message: \`pnpm \${version} instalado\`,
    };
  } catch {
    return {
      name: "pnpm version",
      status: "error",
      message: "pnpm no está instalado — ejecuta: npm install -g pnpm",
      fixable: false,
    };
  }
}
`);

// ─── src/checks/check-npmrc.ts ───────────────────────────────────────────────
write("src/checks/check-npmrc.ts", `
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

const REQUIRED_RULES: Record<string, string> = {
  "ignore-scripts": "true",
  "verify-store-integrity": "true",
  "strict-ssl": "true",
  "node-linker": "isolated",
};

export async function checkNpmrc(projectPath: string): Promise<CheckResult> {
  const npmrcPath = join(projectPath, ".npmrc");

  if (!existsSync(npmrcPath)) {
    return {
      name: ".npmrc",
      status: "error",
      message: ".npmrc no encontrado — configuración de seguridad ausente",
      fixable: true,
      fix: async () => {
        const { applyNpmrc } = await import("../fixer/apply");
        await applyNpmrc(projectPath);
      },
    };
  }

  const content = readFileSync(npmrcPath, "utf-8");
  const missing: string[] = [];

  for (const [key, val] of Object.entries(REQUIRED_RULES)) {
    const regex = new RegExp(\`^\\\\s*\${key}\\\\s*=\\\\s*\${val}\`, "m");
    if (!regex.test(content)) missing.push(\`\${key}=\${val}\`);
  }

  if (missing.length > 0) {
    return {
      name: ".npmrc",
      status: "error",
      message: \`Faltan reglas: \${missing.join(", ")}\`,
      fixable: true,
    };
  }

  return {
    name: ".npmrc",
    status: "ok",
    message: \`\${Object.keys(REQUIRED_RULES).length}/\${Object.keys(REQUIRED_RULES).length} reglas activas\`,
  };
}
`);

// ─── src/checks/check-lockfile.ts ────────────────────────────────────────────
write("src/checks/check-lockfile.ts", `
import { existsSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

export async function checkLockfile(projectPath: string): Promise<CheckResult> {
  const lockPath = join(projectPath, "pnpm-lock.yaml");

  if (!existsSync(lockPath)) {
    return {
      name: "pnpm-lock.yaml",
      status: "error",
      message: "pnpm-lock.yaml no encontrado — ejecuta pnpm install",
      fixable: false,
    };
  }

  // Verificar que el lockfile no está vacío
  const file = Bun.file(lockPath);
  const size = file.size;

  if (size < 50) {
    return {
      name: "pnpm-lock.yaml",
      status: "warn",
      message: "pnpm-lock.yaml parece estar vacío o corrupto",
    };
  }

  return {
    name: "pnpm-lock.yaml",
    status: "ok",
    message: \`Lockfile presente (\${(size / 1024).toFixed(1)} KB)\`,
  };
}
`);

// ─── src/checks/check-renovate.ts ────────────────────────────────────────────
write("src/checks/check-renovate.ts", `
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
  const match = value.match(/^(\\d+)\\s*(day|days)?$/);
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
    };
  }

  const config = JSON.parse(readFileSync(found, "utf-8"));
  const rules: any[] = config.packageRules ?? [];
  const issues: string[] = [];

  for (const [type, minDays] of Object.entries(REQUIRED_DELAYS)) {
    const rule = rules.find((r) => r.matchUpdateTypes?.includes(type));

    if (!rule) {
      issues.push(\`falta regla para '\${type}'\`);
      continue;
    }

    const days = parseDays(rule.minimumReleaseAge);
    if (days < minDays) {
      issues.push(\`\${type}: \${days}d (mínimo \${minDays}d)\`);
    }
  }

  if (issues.length > 0) {
    return {
      name: "renovate.json",
      status: "error",
      message: \`Release delay insuficiente → \${issues.join(" | ")}\`,
      fixable: true,
    };
  }

  return {
    name: "renovate.json",
    status: "ok",
    message: "Release delay: patch 3d · minor 7d · major 30d",
  };
}
`);

// ─── src/checks/check-built-deps.ts ──────────────────────────────────────────
write("src/checks/check-built-deps.ts", `
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

export async function checkBuiltDeps(projectPath: string): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { name: "onlyBuiltDependencies", status: "warn", message: "package.json no encontrado" };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const pnpmConfig = pkg.pnpm ?? {};

  const hasOnly = Array.isArray(pnpmConfig.onlyBuiltDependencies);
  const hasNever = Array.isArray(pnpmConfig.neverBuiltDependencies);

  if (!hasOnly && !hasNever) {
    return {
      name: "onlyBuiltDependencies",
      status: "warn",
      message: "Sin allowlist de scripts — cualquier paquete puede ejecutar postinstall",
      fixable: true,
    };
  }

  const list = hasOnly ? pnpmConfig.onlyBuiltDependencies : pnpmConfig.neverBuiltDependencies;
  const key = hasOnly ? "onlyBuiltDependencies" : "neverBuiltDependencies";

  return {
    name: "onlyBuiltDependencies",
    status: "ok",
    message: \`\${key}: [\${list.join(", ")}]\`,
  };
}
`);

// ─── src/checks/check-only-allow.ts ──────────────────────────────────────────
write("src/checks/check-only-allow.ts", `
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

export async function checkOnlyAllow(projectPath: string): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { name: "only-allow pnpm", status: "warn", message: "package.json no encontrado" };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const preinstall: string = pkg.scripts?.preinstall ?? "";

  if (!preinstall.includes("only-allow pnpm")) {
    return {
      name: "only-allow pnpm",
      status: "warn",
      message: 'scripts.preinstall no tiene "only-allow pnpm"',
      fixable: true,
    };
  }

  return {
    name: "only-allow pnpm",
    status: "ok",
    message: "Forzado: solo pnpm puede instalar dependencias",
  };
}
`);

// ─── src/checks/check-audit.ts ───────────────────────────────────────────────
write("src/checks/check-audit.ts", `
import { $ } from "bun";
import type { CheckResult } from "../types";

export async function checkAudit(projectPath: string): Promise<CheckResult> {
  try {
    const result = await $\`pnpm audit --json\`.cwd(projectPath).text().catch((e) => e.stdout ?? "{}");
    const data = JSON.parse(result || "{}");

    const metadata = data.metadata ?? {};
    const vulnerabilities = metadata.vulnerabilities ?? {};

    const critical = vulnerabilities.critical ?? 0;
    const high = vulnerabilities.high ?? 0;
    const moderate = vulnerabilities.moderate ?? 0;
    const low = vulnerabilities.low ?? 0;
    const total = critical + high + moderate + low;

    if (total === 0) {
      return {
        name: "pnpm audit",
        status: "ok",
        message: "Sin vulnerabilidades conocidas",
      };
    }

    if (critical > 0 || high > 0) {
      return {
        name: "pnpm audit",
        status: "error",
        message: \`\${critical} críticas · \${high} altas · \${moderate} moderadas · \${low} bajas\`,
      };
    }

    return {
      name: "pnpm audit",
      status: "warn",
      message: \`\${moderate} moderadas · \${low} bajas\`,
    };
  } catch {
    return {
      name: "pnpm audit",
      status: "warn",
      message: "No se pudo ejecutar pnpm audit (¿lockfile presente?)",
    };
  }
}
`);

// ─── src/reporter/console.ts ─────────────────────────────────────────────────
write("src/reporter/console.ts", `
import pc from "picocolors";
import type { CheckResult } from "../types";

const ICON: Record<CheckResult["status"], string> = {
  ok:    "✓",
  warn:  "⚠",
  error: "✗",
};

const COLOR: Record<CheckResult["status"], (s: string) => string> = {
  ok:    pc.green,
  warn:  pc.yellow,
  error: pc.red,
};

export function printReport(results: CheckResult[]) {
  const nameW = Math.max(...results.map((r) => r.name.length), 20) + 2;
  const sep = "─".repeat(nameW + 50);

  console.log(pc.dim(sep));
  console.log(
    pc.bold(pc.dim("  " + "Check".padEnd(nameW) + "Estado   " + "Detalle"))
  );
  console.log(pc.dim(sep));

  for (const r of results) {
    const icon = COLOR[r.status](ICON[r.status]);
    const status = COLOR[r.status](r.status.toUpperCase().padEnd(8));
    const fix = r.fixable ? pc.dim(" [--fix]") : "";
    console.log(\`  \${icon} \${r.name.padEnd(nameW)}\${status} \${r.message}\${fix}\`);
  }

  console.log(pc.dim(sep));

  const errors = results.filter((r) => r.status === "error").length;
  const warns  = results.filter((r) => r.status === "warn").length;
  const oks    = results.filter((r) => r.status === "ok").length;

  const summary = [
    oks    ? pc.green(\`\${oks} ok\`)          : "",
    warns  ? pc.yellow(\`\${warns} advertencias\`) : "",
    errors ? pc.red(\`\${errors} errores\`)      : "",
  ].filter(Boolean).join(pc.dim(" · "));

  console.log(\`\\n  \${summary}\\n\`);

  const fixable = results.filter((r) => r.fixable).length;
  if (fixable > 0) {
    console.log(pc.dim(\`  \${fixable} problema(s) con corrección automática disponible → ejecuta con --fix\\n\`));
  }
}
`);

// ─── src/reporter/export.ts ──────────────────────────────────────────────────
write("src/reporter/export.ts", `
import { writeFileSync } from "fs";
import { join } from "path";
import pc from "picocolors";
import type { CheckResult } from "../types";

export async function exportReport(
  results: CheckResult[],
  format: "json" | "markdown",
  projectPath: string
) {
  if (format === "json") {
    const out = {
      timestamp: new Date().toISOString(),
      summary: {
        ok:    results.filter((r) => r.status === "ok").length,
        warn:  results.filter((r) => r.status === "warn").length,
        error: results.filter((r) => r.status === "error").length,
      },
      checks: results.map(({ name, status, message, fixable }) => ({
        name, status, message, fixable: fixable ?? false,
      })),
    };
    const path = join(projectPath, "security-report.json");
    writeFileSync(path, JSON.stringify(out, null, 2));
    console.log(pc.green(\`✓ Reporte JSON exportado → \${path}\`));
  }

  if (format === "markdown") {
    const icon: Record<string, string> = { ok: "✅", warn: "⚠️", error: "❌" };
    const rows = results
      .map((r) => \`| \${icon[r.status]} | \${r.name} | \${r.message} |\`)
      .join("\\n");

    const md = \`# Security Report
> Generado: \${new Date().toISOString()}

| Estado | Check | Detalle |
|--------|-------|---------|
\${rows}
\`;
    const path = join(projectPath, "security-report.md");
    writeFileSync(path, md);
    console.log(pc.green(\`✓ Reporte Markdown exportado → \${path}\`));
  }
}
`);

// ─── src/fixer/apply.ts ───────────────────────────────────────────────────────
write("src/fixer/apply.ts", `
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import pc from "picocolors";
import type { CheckResult } from "../types";

export async function applyFixes(results: CheckResult[], projectPath: string) {
  const fixable = results.filter((r) => r.status !== "ok" && r.fixable && r.fix);

  if (fixable.length === 0) {
    console.log(pc.dim("  No hay correcciones automáticas disponibles.\\n"));
    return;
  }

  console.log(pc.bold(\`\\n🔧 Aplicando \${fixable.length} corrección(es)...\\n\`));

  for (const r of fixable) {
    try {
      await r.fix!();
      console.log(pc.green(\`  ✓ \${r.name} corregido\`));
    } catch (e) {
      console.error(pc.red(\`  ✗ Error corrigiendo \${r.name}: \${e}\`));
    }
  }

  console.log();
}

export async function applyNpmrc(projectPath: string) {
  const template = await Bun.file(
    join(import.meta.dir, "../../templates/.npmrc")
  ).text();
  writeFileSync(join(projectPath, ".npmrc"), template);
}

export async function applyRenovate(projectPath: string) {
  const template = await Bun.file(
    join(import.meta.dir, "../../templates/renovate.json")
  ).text();
  writeFileSync(join(projectPath, "renovate.json"), template);
}
`);

// ─── templates/.npmrc ────────────────────────────────────────────────────────
write("templates/.npmrc", `
ignore-scripts=true
verify-store-integrity=true
strict-ssl=true
frozen-lockfile=true
node-linker=isolated
registry=https://registry.npmjs.org/
`);

// ─── templates/renovate.json ─────────────────────────────────────────────────
write("templates/renovate.json", `
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "packageRules": [
    {
      "matchUpdateTypes": ["patch"],
      "minimumReleaseAge": "3 days",
      "automerge": true
    },
    {
      "matchUpdateTypes": ["minor"],
      "minimumReleaseAge": "7 days",
      "automerge": false
    },
    {
      "matchUpdateTypes": ["major"],
      "minimumReleaseAge": "30 days",
      "automerge": false
    }
  ]
}
`);

// ─── tests/checks.test.ts ────────────────────────────────────────────────────
write("tests/checks.test.ts", `
import { describe, it, expect } from "bun:test";
import { detectProject } from "../src/checks/detect-project";
import { checkNpmrc } from "../src/checks/check-npmrc";
import { checkRenovate } from "../src/checks/check-renovate";
import { checkLockfile } from "../src/checks/check-lockfile";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

const TMP = "./tmp-test-project";

function setup() {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
}

function teardown() {
  rmSync(TMP, { recursive: true, force: true });
}

describe("detectProject", () => {
  it("detecta proyecto node con package.json", async () => {
    setup();
    const result = await detectProject(TMP);
    expect(result.valid).toBe(true);
    expect(result.type).toBe("node");
    teardown();
  });

  it("falla si no hay package.json", async () => {
    mkdirSync(TMP, { recursive: true });
    const result = await detectProject(TMP);
    expect(result.valid).toBe(false);
    teardown();
  });
});

describe("checkNpmrc", () => {
  it("retorna error si .npmrc no existe", async () => {
    setup();
    const result = await checkNpmrc(TMP);
    expect(result.status).toBe("error");
    teardown();
  });

  it("retorna ok si .npmrc tiene todas las reglas", async () => {
    setup();
    writeFileSync(join(TMP, ".npmrc"), [
      "ignore-scripts=true",
      "verify-store-integrity=true",
      "strict-ssl=true",
      "node-linker=isolated",
    ].join("\\n"));
    const result = await checkNpmrc(TMP);
    expect(result.status).toBe("ok");
    teardown();
  });
});

describe("checkRenovate", () => {
  it("retorna warn si no existe renovate.json", async () => {
    setup();
    const result = await checkRenovate(TMP);
    expect(result.status).toBe("warn");
    teardown();
  });

  it("retorna error si release delay es insuficiente", async () => {
    setup();
    writeFileSync(join(TMP, "renovate.json"), JSON.stringify({
      packageRules: [
        { matchUpdateTypes: ["patch"], minimumReleaseAge: "1 days" },
        { matchUpdateTypes: ["minor"], minimumReleaseAge: "2 days" },
        { matchUpdateTypes: ["major"], minimumReleaseAge: "5 days" },
      ]
    }));
    const result = await checkRenovate(TMP);
    expect(result.status).toBe("error");
    teardown();
  });

  it("retorna ok con delays correctos", async () => {
    setup();
    writeFileSync(join(TMP, "renovate.json"), JSON.stringify({
      packageRules: [
        { matchUpdateTypes: ["patch"], minimumReleaseAge: "3 days" },
        { matchUpdateTypes: ["minor"], minimumReleaseAge: "7 days" },
        { matchUpdateTypes: ["major"], minimumReleaseAge: "30 days" },
      ]
    }));
    const result = await checkRenovate(TMP);
    expect(result.status).toBe("ok");
    teardown();
  });
});

describe("checkLockfile", () => {
  it("retorna error si no existe pnpm-lock.yaml", async () => {
    setup();
    const result = await checkLockfile(TMP);
    expect(result.status).toBe("error");
    teardown();
  });
});
`);

// ─── README.md ───────────────────────────────────────────────────────────────
write("README.md", `
# locksmith

CLI global para validar políticas de seguridad en proyectos Node/Bun con pnpm.

## Instalación

\`\`\`bash
bun add -g .   # desde el directorio del CLI
\`\`\`

## Uso

\`\`\`bash
# Analizar proyecto actual
locksmith

# Analizar ruta específica
locksmith /path/to/project

# Aplicar correcciones automáticas
locksmith --fix

# Exportar reporte
locksmith --report json
locksmith --report markdown

# Modo estricto (falla en warnings)
locksmith --strict
\`\`\`

## Checks incluidos

| Check | Qué verifica |
|-------|-------------|
| pnpm version | pnpm instalado y versión mínima 8 |
| .npmrc | ignore-scripts, ssl, node-linker |
| pnpm-lock.yaml | lockfile presente e íntegro |
| renovate.json | release delay patch/minor/major |
| onlyBuiltDependencies | allowlist de scripts de build |
| only-allow pnpm | preinstall guard |
| pnpm audit | vulnerabilidades conocidas |

## Tests

\`\`\`bash
bun test
\`\`\`
`);

console.log("\n✅ Proyecto generado en ./locksmith\n");
console.log("📦 Próximos pasos:\n");
console.log("  cd locksmith");
console.log("  bun install");
console.log("  bun test");
console.log("  bun dev                          # probar en el directorio actual");
console.log("  bun dev /ruta/a/otro/proyecto    # probar en otro proyecto");
console.log("  bun add -g .                     # instalar globalmente\n");
