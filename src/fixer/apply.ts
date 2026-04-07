import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import pc from "picocolors";
import type { CheckResult } from "../types";

export async function applyFixes(results: CheckResult[], projectPath: string) {
  const fixable = results.filter((r) => r.status !== "ok" && r.fixable && r.fix);

  if (fixable.length === 0) {
    console.log(pc.dim("  No hay correcciones automáticas disponibles.\n"));
    return;
  }

  console.log(pc.bold(`\n🔧 Aplicando ${fixable.length} corrección(es)...\n`));

  for (const r of fixable) {
    try {
      await r.fix!();
      console.log(pc.green(`  ✓ ${r.name} corregido`));
    } catch (e) {
      console.error(pc.red(`  ✗ Error corrigiendo ${r.name}: ${e}`));
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

export async function applyOnlyBuiltDeps(projectPath: string) {
  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.pnpm = { ...(pkg.pnpm ?? {}), onlyBuiltDependencies: [] };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

export async function applyOnlyAllow(projectPath: string) {
  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.scripts = { ...(pkg.scripts ?? {}), preinstall: "npx only-allow pnpm" };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

export async function applyPackageManager(projectPath: string) {
  const { $ } = await import("bun");
  const version = (await $`pnpm --version`.text()).trim();
  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.packageManager = `pnpm@${version}`;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}
