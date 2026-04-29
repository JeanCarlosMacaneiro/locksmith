import { z } from "zod";
import { detectProject } from "../../checks/detect-project";
import { analyzeDockerfile } from "../../docker/analyze-dockerfile";
import { evaluateQualityGate } from "../../docker/quality-gate";
import type { DockerSeverity } from "../../types";
import type { ToolDefinition, DockerAuditOutput } from "../types";

export function createAuditDockerTool(deps = {
  detectProject,
  analyzeDockerfile,
  evaluateQualityGate,
}): ToolDefinition {
  return {
    name: "locksmith_audit_docker",
    description:
      "Analyze a project's Dockerfiles for issues without applying any changes. " +
      "Detects Dockerfiles in the root, docker/, and .docker/ directories automatically. " +
      "Includes a severity-based quality gate.",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory"),
      failOn: z.enum(["critical", "high", "medium", "low", "none"]).optional().describe("Severity threshold to fail the quality gate"),
    },
    async handler(args) {
      const projectPath = args.projectPath as string;
      const failOn = (args.failOn as DockerSeverity | "none" | undefined) ?? "high";
      try {
        const project = await deps.detectProject(projectPath);
        const analyses = deps.analyzeDockerfile(projectPath, project.type, { security: true });

        if (analyses.length === 0 || !analyses[0]!.found) {
          const output: DockerAuditOutput = {
            found: false,
            dockerfilePath: null,
            issues: [],
            issueCount: 0,
            hasFixableIssues: false,
            qualityGatePassed: true,
            qualityGateSummary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          };
          return { content: [{ type: "text", text: JSON.stringify(output) }] };
        }

        const best = analyses.reduce(
          (a, b) => a.issues.length >= b.issues.length ? a : b,
          analyses[0]!,
        );

        const { qualityGatePassed, qualityGateSummary } = deps.evaluateQualityGate(best.issues, failOn);

        const output: DockerAuditOutput = {
          found: true,
          dockerfilePath: best.dockerfilePath,
          issues: best.issues,
          issueCount: best.issues.length,
          hasFixableIssues: best.issues.some((i) => i.replacement !== null),
          qualityGatePassed,
          qualityGateSummary,
        };

        return { content: [{ type: "text", text: JSON.stringify(output) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "INTERNAL_ERROR", message: String(err) }) }],
        };
      }
    },
  };
}

export const auditDockerTool = createAuditDockerTool();
