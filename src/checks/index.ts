import pc from "picocolors";
import { detectProject }      from "./detect-project";
import { checkRenovate }      from "./check-renovate";
import { printReport }        from "../reporter/console";
import { exportReport }       from "../reporter/export";
import { applyFixes }         from "../fixer/apply";
import { runOutdated }        from "../outdated/index";
import { analyzeDockerfile }  from "../docker/analyze-dockerfile";
import { showDockerWarnings } from "../docker/prompt-dockerfile";
import { promptDockerFix }    from "../docker/prompt-dockerfile";
import type { RunOptions }    from "../types";

// ── Shared checks ─────────────────────────────────────────────────────────────
import { checkSecrets }        from "./check-secrets";
import { checkGitignore }      from "./check-gitignore";

// ── Node checks ───────────────────────────────────────────────────────────────
import { checkPnpm }           from "./check-pnpm";
import { checkNpmrc }          from "./check-npmrc";
import { checkLockfile }       from "./check-lockfile";
import { checkAudit }          from "./check-audit";
import { checkBuiltDeps }      from "./check-built-deps";
import { checkOnlyAllow }      from "./check-only-allow";
import { checkPackageManager } from "./check-package-manager";
import { checkNodeVersion }    from "./check-node-version";
import { checkScripts }        from "./check-scripts";

// ── Python checks ─────────────────────────────────────────────────────────────
import { checkPoetry }         from "./python/check-poetry";
import { checkPyproject }      from "./python/check-pyproject";
import { checkPoetryToml }     from "./python/check-poetry-toml";
import { checkPoetryLock }     from "./python/check-poetry-lock";
import { checkPoetryAudit }    from "./python/check-poetry-audit";
import { checkDepGroups }      from "./python/check-dep-groups";
import { checkPythonVersion }  from "./python/check-python-version";
import { checkPypiSource }     from "./python/check-pypi-source";

export async function runChecks(projectPath: string, type: string) {
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
      checkGitignore(projectPath),
      checkSecrets(projectPath),
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
    checkNodeVersion(projectPath),
    checkAudit(projectPath),
    checkGitignore(projectPath),
    checkSecrets(projectPath),
    checkScripts(projectPath),
  ]);
}

async function runDockerfileFlow(
  projectPath: string,
  projectType: string,
  mode: "check" | "fix",
  autoFix = false,
): Promise<void> {
  const analyses = analyzeDockerfile(projectPath, projectType);
  if (mode === "fix") {
    await promptDockerFix(analyses, projectPath, autoFix);
  } else {
    await showDockerWarnings(analyses, projectPath);
  }
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

  // --fix-dockerfile only: skip security checks, apply Docker fixes directly
  if ((opts.fixDockerfile || opts.fixDocker) && !opts.fix) {
    await runDockerfileFlow(opts.projectPath, project.type, "fix", true);
    process.exit(0);
  }

  const results = await runChecks(opts.projectPath, project.type);

  if (!opts.fix) {
    printReport(results);
  }

  if (opts.fix) {
    await applyFixes(results, opts.projectPath);

    console.log(pc.bold("\n🔄 Verificando resultado...\n"));

    const reResults = (await runChecks(opts.projectPath, project.type))
      .map((r, i) => {
        const before   = results[i];
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

    await runDockerfileFlow(opts.projectPath, project.type, "fix", false);

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

  await runDockerfileFlow(opts.projectPath, project.type, "check");

  const hasErrors   = results.some((r) => r.status === "error");
  const hasWarnings = results.some((r) => r.status === "warn");

  if (hasErrors || (opts.strict && hasWarnings)) process.exit(1);
  process.exit(0);
}
