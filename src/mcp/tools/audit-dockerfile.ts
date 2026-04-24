import { z } from "zod";
import { detectProject } from "../../checks/detect-project";
import { analyzeDockerfile } from "../../docker/analyze-dockerfile";
import type { ToolDefinition, DockerAuditOutput } from "../types";

export function createAuditDockerfileTool(deps = {
  detectProject,
  analyzeDockerfile,
}): ToolDefinition {
  return {
    name: "locksmith_audit_dockerfile",
    description:
      "Analyze a project's Dockerfile for security issues without applying any changes. " +
      "Detects Dockerfiles in the root, docker/, and .docker/ directories automatically.",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory"),
    },
    async handler(args) {
      const projectPath = args.projectPath as string;
      try {
        const project = await deps.detectProject(projectPath);
        const analyses = deps.analyzeDockerfile(projectPath, project.type);

        if (analyses.length === 0 || !analyses[0]!.found) {
          const output: DockerAuditOutput = {
            found: false,
            dockerfilePath: null,
            issues: [],
            issueCount: 0,
            hasFixableIssues: false,
          };
          return { content: [{ type: "text", text: JSON.stringify(output) }] };
        }

        const best = analyses.reduce(
          (a, b) => a.issues.length >= b.issues.length ? a : b,
          analyses[0]!
        );

        const output: DockerAuditOutput = {
          found: true,
          dockerfilePath: best.dockerfilePath,
          issues: best.issues,
          issueCount: best.issues.length,
          hasFixableIssues: best.issues.some((i) => i.replacement !== null),
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

export const auditDockerfileTool = createAuditDockerfileTool();
