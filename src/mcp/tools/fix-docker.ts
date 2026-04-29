import { z } from "zod";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { detectProject } from "../../checks/detect-project";
import { analyzeDockerfile } from "../../docker/analyze-dockerfile";
import { applyDockerfileFix } from "../../docker/fix-dockerfile";
import { applyDockerignoreFix } from "../../docker/fix-dockerignore";
import type { DockerIssue } from "../../types";
import type { ToolDefinition, DockerFixOutput, BuildFailure, LLMContext, NextStep } from "../types";

type FixState = {
  dockerfilePath: string;
  originalContent: string;
  iterationCount: number;
};

function statePath(projectPath: string): string {
  return join(projectPath, ".locksmith-docker-fix-state.json");
}

function loadState(projectPath: string): FixState | null {
  const p = statePath(projectPath);
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8")) as Partial<FixState>;
    if (typeof raw.dockerfilePath !== "string") return null;
    if (typeof raw.originalContent !== "string") return null;
    if (typeof raw.iterationCount !== "number") return null;
    return { dockerfilePath: raw.dockerfilePath, originalContent: raw.originalContent, iterationCount: raw.iterationCount };
  } catch {
    return null;
  }
}

function saveState(projectPath: string, st: FixState): void {
  writeFileSync(statePath(projectPath), JSON.stringify(st), "utf-8");
}

function clearState(projectPath: string): void {
  const p = statePath(projectPath);
  if (!existsSync(p)) return;
  rmSync(p, { force: true });
}

function computeUnifiedDiff(originalContent: string, fixedContent: string): string {
  const a = originalContent.split("\n");
  const b = fixedContent.split("\n");
  const header = ["--- original", "+++ fixed", `@@ -1,${a.length} +1,${b.length} @@`];
  const removed = a.map((l) => `-${l}`);
  const added = b.map((l) => `+${l}`);
  return [...header, ...removed, ...added].join("\n");
}

function buildProbableCause(diff: string, buildError: string): { probableCause: string; suggestedApproach: string } {
  const e = buildError.toLowerCase();
  const d = diff.toLowerCase();

  if (e.includes("user") && d.includes("\n+user ")) {
    return {
      probableCause: "El cambio relacionado a USER probablemente introdujo un usuario inexistente o sin permisos en el contenedor.",
      suggestedApproach: "Asegura que el usuario exista antes de usar USER, y que tenga permisos sobre el WORKDIR (adduser/useradd + chown).",
    };
  }

  if (e.includes("pnpm") || e.includes("corepack")) {
    return {
      probableCause: "El cambio en la instalación de dependencias (pnpm/corepack) probablemente no es compatible con la imagen base o el orden de COPY/RUN.",
      suggestedApproach: "Revisa el orden de COPY de lockfiles, ejecuta corepack enable, y valida que el comando de instalación use flags compatibles.",
    };
  }

  if (e.includes("apt-get") || e.includes("apk")) {
    return {
      probableCause: "Un cambio en la instalación de paquetes del sistema (apt/apk) probablemente dejó un comando inválido o incompleto.",
      suggestedApproach: "Combina update/install/cleanup en el mismo RUN y valida paquetes/nombres según la distro base.",
    };
  }

  return {
    probableCause: "El fix automático cambió el Dockerfile de una forma incompatible con el build actual.",
    suggestedApproach: "Aísla el cambio mínimo que rompe el build y ajusta el Dockerfile manteniendo la intención del fix.",
  };
}

async function runDockerBuild(projectPath: string, dockerfilePath: string): Promise<{ exitCode: number; stderr: string } | null> {
  const check = Bun.spawn({ cmd: ["docker", "--version"], cwd: projectPath, stdout: "pipe", stderr: "pipe" });
  const checkExit = await check.exited;
  if (checkExit !== 0) return null;

  const proc = Bun.spawn({
    cmd: ["docker", "build", "-f", dockerfilePath, projectPath],
    cwd: projectPath,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const combined = [stdout, stderr].filter((x) => x !== "").join("\n");
  return { exitCode: exitCode ?? 1, stderr: combined };
}

function isDockerignoreIssue(issue: DockerIssue): boolean {
  return issue.original.startsWith(".dockerignore");
}

function isDockerfileFixableIssue(issue: DockerIssue): boolean {
  return issue.replacement !== null && !isDockerignoreIssue(issue);
}

export function createFixDockerTool(deps = {
  detectProject,
  analyzeDockerfile,
  applyDockerfileFix,
  applyDockerignoreFix,
  readFileSync,
  writeFileSync,
  runDockerBuild,
  loadState,
  saveState,
  clearState,
  computeUnifiedDiff,
  buildProbableCause,
}): ToolDefinition {
  return {
    name: "locksmith_fix_docker",
    description:
      "Apply automatic Docker fixes (Dockerfile + .dockerignore). Optionally verifies the build with `docker build` and supports an LLM-assisted recovery loop.",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory"),
      verifyBuild: z.boolean().optional().default(false),
      buildFixProposal: z.string().optional().describe("Full proposed Dockerfile content to apply and verify"),
    },
    async handler(args) {
      const projectPath = args.projectPath as string;
      const verifyBuild = Boolean(args.verifyBuild);
      const buildFixProposal = typeof args.buildFixProposal === "string" ? (args.buildFixProposal as string) : null;

      try {
        const project = await deps.detectProject(projectPath);
        const analyses = deps.analyzeDockerfile(projectPath, project.type, { security: true });

        if (analyses.length === 0 || !analyses[0]!.found) {
          const output: DockerFixOutput = { fixed: false, issuesFixed: 0, dockerfilePath: null };
          return { content: [{ type: "text", text: JSON.stringify(output) }] };
        }

        const best = analyses.reduce(
          (a, b) => a.issues.length >= b.issues.length ? a : b,
          analyses[0]!,
        );

        const dockerfilePath = best.dockerfilePath!;
        const currentContent = deps.readFileSync(dockerfilePath, "utf-8") as string;

        const dockerignorePatternsToAppend = best.issues
          .filter((i) => isDockerignoreIssue(i) && i.replacement !== null)
          .map((i) => i.replacement!.trim())
          .filter((x) => x !== "" && !x.includes("\n"));

        deps.applyDockerignoreFix(projectPath, dockerignorePatternsToAppend);

        const dockerfileFixableIssues = best.issues.filter(isDockerfileFixableIssue);
        const issuesFixedByDockerfile = dockerfileFixableIssues.length;

        const originalContentForAttempt = currentContent;

        if (buildFixProposal !== null) {
          deps.writeFileSync(dockerfilePath, buildFixProposal, "utf-8");
        } else {
          deps.applyDockerfileFix(best);
        }

        const afterContent = deps.readFileSync(dockerfilePath, "utf-8") as string;

        const fixed = (buildFixProposal !== null)
          ? buildFixProposal !== currentContent
          : issuesFixedByDockerfile > 0 || dockerignorePatternsToAppend.length > 0;

        const outputBase: DockerFixOutput = {
          fixed,
          issuesFixed: issuesFixedByDockerfile + dockerignorePatternsToAppend.length,
          dockerfilePath,
        };

        if (!verifyBuild) {
          deps.clearState(projectPath);
          return { content: [{ type: "text", text: JSON.stringify(outputBase) }] };
        }

        const existingState = deps.loadState(projectPath);
        const state = existingState && existingState.dockerfilePath === dockerfilePath
          ? existingState
          : { dockerfilePath, originalContent: originalContentForAttempt, iterationCount: 0 };

        const nextIteration = state.iterationCount + 1;
        state.iterationCount = nextIteration;
        deps.saveState(projectPath, state);

        const build = await deps.runDockerBuild(projectPath, dockerfilePath);
        if (build === null) {
          deps.clearState(projectPath);
          const out: DockerFixOutput = { ...outputBase, buildVerified: false, buildSkipped: true };
          return { content: [{ type: "text", text: JSON.stringify(out) }] };
        }

        if (build.exitCode === 0) {
          deps.clearState(projectPath);
          const out: DockerFixOutput = {
            ...outputBase,
            buildVerified: true,
            buildFixed: buildFixProposal !== null ? true : undefined,
          };
          return { content: [{ type: "text", text: JSON.stringify(out) }] };
        }

        const diff = deps.computeUnifiedDiff(state.originalContent, afterContent);
        const { probableCause, suggestedApproach } = deps.buildProbableCause(diff, build.stderr);

        const appliedFixes = buildFixProposal !== null
          ? []
          : dockerfileFixableIssues;

        const buildFailure: BuildFailure = {
          exitCode: build.exitCode,
          stderr: build.stderr,
          appliedFixes,
          originalContent: state.originalContent,
          fixedContent: afterContent,
        };

        const llmContext: LLMContext = {
          diff,
          buildError: build.stderr,
          probableCause,
          suggestedApproach,
          userMessage: "El docker build falló después de aplicar el fix. Se devolvió contexto para iterar una propuesta corregida.",
        };

        const remainingIterations = Math.max(0, 5 - state.iterationCount);

        const nextStep: NextStep = {
          tool: "locksmith_fix_docker",
          requiredParams: {
            projectPath,
            verifyBuild: true,
            buildFixProposal: "<REEMPLAZA_CON_DOCKERFILE_COMPLETO>",
          },
        };

        if (state.iterationCount >= 5) {
          deps.writeFileSync(dockerfilePath, state.originalContent, "utf-8");
          deps.clearState(projectPath);
          const out: DockerFixOutput = {
            ...outputBase,
            buildVerified: false,
            buildFixed: false,
            maxIterationsReached: true,
            buildFailure,
            llmContext,
            iterationCount: state.iterationCount,
            remainingIterations,
            nextStep,
          };
          return { content: [{ type: "text", text: JSON.stringify(out) }] };
        }

        const out: DockerFixOutput = {
          ...outputBase,
          buildVerified: false,
          buildFixed: false,
          buildFailure,
          llmContext,
          iterationCount: state.iterationCount,
          remainingIterations,
          nextStep,
        };

        return { content: [{ type: "text", text: JSON.stringify(out) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "INTERNAL_ERROR", message: String(err) }) }],
        };
      }
    },
  };
}

export const fixDockerTool = createFixDockerTool();
