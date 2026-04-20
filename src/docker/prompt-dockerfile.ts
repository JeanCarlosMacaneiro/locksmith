import pc from "picocolors";
import * as readline from "readline";
import { relative } from "path";
import type { DockerfileAnalysis, DockerIssue } from "../types";
import { applyDockerfileFix } from "./fix-dockerfile";

const KIND_LABEL: Record<DockerIssue["kind"], string> = {
  "pin-version":  "pin-version ",
  "missing-flag": "missing-flag",
  "missing-copy": "missing-copy",
  "advisory":     "advisory    ",
};

function displayIssues(analysis: DockerfileAnalysis, projectPath: string): void {
  const relPath = relative(projectPath, analysis.dockerfilePath!);
  console.log(pc.bold(`\n🐳 Dockerfile: ${pc.cyan(relPath)}`));

  if (analysis.issues.length === 0) {
    console.log(pc.green("  ✓ Dockerfile al día\n"));
    return;
  }

  const fixable  = analysis.issues.filter(x => x.replacement !== null);
  const advisory = analysis.issues.filter(x => x.replacement === null);

  if (fixable.length > 0) {
    console.log(pc.dim("  Problemas encontrados:"));
    for (const issue of fixable) {
      const lineTag = pc.dim(`L${issue.line}`.padEnd(5));
      const kind    = pc.yellow(KIND_LABEL[issue.kind]);
      console.log(`  ${pc.yellow("⚠")}  ${lineTag} ${kind}  ${issue.description}`);
    }
  }

  if (advisory.length > 0) {
    console.log(pc.dim("\n  [sin corrección automática]"));
    for (const issue of advisory) {
      const lineTag = pc.dim(`L${issue.line}`.padEnd(5));
      console.log(`  ${pc.dim("ℹ")}  ${lineTag} ${pc.dim(KIND_LABEL[issue.kind])}  ${pc.dim(issue.description)}`);
    }
  }

  console.log();
}

async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === "y" || a === "yes");
    });
  });
}

export async function showDockerWarnings(
  analyses: DockerfileAnalysis[],
  projectPath: string
): Promise<void> {
  const found = analyses.filter(a => a.found);
  if (found.length === 0) return;

  for (const analysis of found) {
    if (analysis.issues.length === 0) continue;
    displayIssues(analysis, projectPath);
  }

  const withIssues = found.filter(a => a.issues.length > 0);
  if (withIssues.length > 0) {
    console.log(pc.dim("  → ejecuta locksmith --fix-dockerfile para corregir\n"));
  }
}

export async function promptDockerFix(
  analyses: DockerfileAnalysis[],
  projectPath: string
): Promise<void> {
  const found = analyses.filter(a => a.found);

  if (found.length === 0) {
    console.log(pc.dim("  No se encontró Dockerfile en el proyecto.\n"));
    return;
  }

  for (const analysis of found) {
    displayIssues(analysis, projectPath);

    const fixable = analysis.issues.filter(x => x.replacement !== null);
    if (fixable.length === 0) continue;

    if (!process.stdin.isTTY) {
      console.log(pc.dim("  (modo no-interactivo — ejecuta locksmith --fix-dockerfile en terminal)\n"));
      continue;
    }

    const relPath   = relative(projectPath, analysis.dockerfilePath!);
    const confirmed = await askConfirmation(
      pc.bold(`  ¿Actualizar ${relPath}? `) + pc.dim("[y/N] ")
    );

    if (confirmed) {
      applyDockerfileFix(analysis);
      console.log(pc.green(`  ✓ ${relPath} actualizado\n`));
    } else {
      console.log(pc.dim(`  Saltando ${relPath}\n`));
    }
  }
}
