import pc from "picocolors";
import { detectProject }      from "./detect-project";
import { checkRenovate }      from "./check-renovate";
import { printReport }        from "../reporter/console";
import { exportReport }       from "../reporter/export";
import { applyFixes }         from "../fixer/apply";
import { runOutdated }        from "../outdated/index";
import type { RunOptions }    from "../types";

// ── Node checks ───────────────────────────────────────────────────────────────
import { checkPnpm }           from "./check-pnpm";
import { checkNpmrc }          from "./check-npmrc";
import { checkLockfile }       from "./check-lockfile";
import { checkAudit }          from "./check-audit";
import { checkBuiltDeps }      from "./check-built-deps";
import { checkOnlyAllow }      from "./check-only-allow";
import { checkPackageManager } from "./check-package-manager";

// ── Python checks ─────────────────────────────────────────────────────────────
import { checkPoetry }         from "./python/check-poetry";
import { checkPyproject }      from "./python/check-pyproject";
import { checkPoetryToml }     from "./python/check-poetry-toml";
import { checkPoetryLock }     from "./python/check-poetry-lock";
import { checkPoetryAudit }    from "./python/check-poetry-audit";
import { checkDepGroups }      from "./python/check-dep-groups";
import { checkPythonVersion }  from "./python/check-python-version";
import { checkPypiSource }     from "./python/check-pypi-source";

async function runChecks(projectPath: string, type: string) {
  if (type === "python") {
    return Promise.all([
      checkPoetry(projectPath),
      checkPyproject(projectPath),
      checkPoetryToml(projectPath),
      checkPoetryLock(projectPath),
      checkRenovate(projectPath),
      checkPoetryAudit(projectPath),
      checkDepGroups(projectPath),
      checkPythonVersion(projectPath),
      checkPypiSource(projectPath),
    ]);
  }

  return Promise.all([
    checkPnpm(projectPath),
    checkNpmrc(projectPath),
    checkLockfile(projectPath),
    checkRenovate(projectPath),
    checkBuiltDeps(projectPath),
    checkOnlyAllow(projectPath),
    checkPackageManager(projectPath),
    checkAudit(projectPath),
  ]);
}

export async function runAllChecks(opts: RunOptions) {
  console.log(pc.bold("\n🔐 locksmith\n"));
  console.log(pc.dim(`   Analizando: ${opts.projectPath}\n`));

  const project = await detectProject(opts.projectPath);

  if (!project.valid) {
    console.error(pc.red("✗ No se encontró package.json ni pyproject.toml en este directorio."));
    process.exit(1);
  }

  console.log(
    pc.green(`✓ Proyecto: ${pc.bold(project.name)} [${project.type}]\n`)
  );

  const results = await runChecks(opts.projectPath, project.type);

  printReport(results);

  if (opts.fix) {
    await applyFixes(results, opts.projectPath);

    console.log(pc.bold("\n🔄 Verificando resultado...\n"));

    const reResults = (await runChecks(opts.projectPath, project.type))
      .map((r, i) => {
        const before  = results[i];
        const wasFixed = before!.status !== "ok" && r.status === "ok";
        return { ...r, wasFixed };
      });

    printReport(reResults);

    if (opts.report) {
      await exportReport(reResults, opts.report, opts.projectPath);
    }

    if (opts.outdated) {
      console.log(pc.bold("\n🔍 Verificando paquetes desactualizados...\n"));
      await runOutdated(opts.projectPath, project.type, true);
    }

    const hasErrors   = reResults.some((r) => r.status === "error");
    const hasWarnings = reResults.some((r) => r.status === "warn");

    if (hasErrors || (opts.strict && hasWarnings)) process.exit(1);
    process.exit(0);
  }

  if (opts.report) {
    await exportReport(results, opts.report, opts.projectPath);
  }

  if (opts.outdated) {
    console.log(pc.bold("\n🔍 Verificando paquetes desactualizados...\n"));
    await runOutdated(opts.projectPath, project.type, opts.fix);
  }

  const hasErrors   = results.some((r) => r.status === "error");
  const hasWarnings = results.some((r) => r.status === "warn");

  if (hasErrors || (opts.strict && hasWarnings)) process.exit(1);
  process.exit(0);
}
