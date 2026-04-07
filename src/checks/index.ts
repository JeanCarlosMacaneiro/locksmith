import pc from "picocolors";
import { detectProject } from "./detect-project";
import { checkPnpm } from "./check-pnpm";
import { checkNpmrc } from "./check-npmrc";
import { checkLockfile } from "./check-lockfile";
import { checkRenovate } from "./check-renovate";
import { checkAudit } from "./check-audit";
import { checkBuiltDeps } from "./check-built-deps";
import { checkOnlyAllow } from "./check-only-allow";
import { checkPackageManager } from "./check-package-manager";
import { printReport } from "../reporter/console";
import { exportReport } from "../reporter/export";
import { applyFixes } from "../fixer/apply";
import type { RunOptions } from "../types";

export async function runAllChecks(opts: RunOptions) {
  console.log(pc.bold("\n🔐 locksmith\n"));
  console.log(pc.dim(`   Analizando: ${opts.projectPath}\n`));

  const project = await detectProject(opts.projectPath);

  if (!project.valid) {
    console.error(pc.red("✗ No se encontró package.json en este directorio."));
    process.exit(1);
  }

  console.log(
    pc.green(`✓ Proyecto: ${pc.bold(project.name)} [${project.type}]\n`)
  );

  const results = await Promise.all([
    checkPnpm(opts.projectPath),
    checkNpmrc(opts.projectPath),
    checkLockfile(opts.projectPath),
    checkRenovate(opts.projectPath),
    checkBuiltDeps(opts.projectPath),
    checkOnlyAllow(opts.projectPath),
    checkPackageManager(opts.projectPath),
    checkAudit(opts.projectPath),
  ]);

  printReport(results);

  if (opts.fix) {
    await applyFixes(results, opts.projectPath);

    // Re-run all checks after fixes and show updated report
    console.log(pc.bold("\n🔄 Verificando resultado...\n"));

    const reResults = (await Promise.all([
      checkPnpm(opts.projectPath),
      checkNpmrc(opts.projectPath),
      checkLockfile(opts.projectPath),
      checkRenovate(opts.projectPath),
      checkBuiltDeps(opts.projectPath),
      checkOnlyAllow(opts.projectPath),
      checkPackageManager(opts.projectPath),
      checkAudit(opts.projectPath),
    ])).map((r, i) => {
      const before = results[i];
      const wasFixed = before!.status !== "ok" && r.status === "ok";
      return { ...r, wasFixed };
    });

    printReport(reResults);

    if (opts.report) {
      await exportReport(reResults, opts.report, opts.projectPath);
    }

    const hasErrors = reResults.some((r) => r.status === "error");
    const hasWarnings = reResults.some((r) => r.status === "warn");

    if (hasErrors || (opts.strict && hasWarnings)) {
      process.exit(1);
    }

    process.exit(0);
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
