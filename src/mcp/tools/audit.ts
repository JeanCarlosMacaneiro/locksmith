import { z } from "zod";
import { detectProject } from "../../checks/detect-project";
import { runChecks } from "../../checks/index";
import type { ToolDefinition, AuditOutput, McpErrorOutput } from "../types";
import { serializeCheckResult } from "../types";

export function createAuditTool(deps = {
  detectProject,
  runChecks,
}): ToolDefinition {
  return {
    name: "locksmith_audit",
    description:
      "Run a full security audit on a project. Detects project type and runs all relevant checks " +
      "(package manager, lockfile, renovate config, secrets, gitignore, etc.). " +
      "Call this before any critical action like installing packages, building, or committing.",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory"),
    },
    async handler(args) {
      const projectPath = args.projectPath as string;
      try {
        const project = await deps.detectProject(projectPath);
        if (!project.valid) {
          const output: McpErrorOutput = {
            error: "PROJECT_NOT_FOUND",
            message: `No se encontró package.json ni pyproject.toml en: ${projectPath}`,
          };
          return { content: [{ type: "text", text: JSON.stringify(output) }] };
        }

        const checks = await deps.runChecks(projectPath, project.type);
        const serialized = checks.map(serializeCheckResult);

        const summary = {
          ok: serialized.filter((c) => c.status === "ok").length,
          warn: serialized.filter((c) => c.status === "warn").length,
          error: serialized.filter((c) => c.status === "error").length,
        };

        const output: AuditOutput = {
          projectType: project.type,
          projectName: project.name,
          summary,
          checks: serialized,
          hasErrors: summary.error > 0,
          hasWarnings: summary.warn > 0,
          fixableCount: serialized.filter((c) => c.fixable).length,
        };

        return { content: [{ type: "text", text: JSON.stringify(output) }] };
      } catch (err) {
        const output: McpErrorOutput = {
          error: "INTERNAL_ERROR",
          message: String(err),
        };
        return { content: [{ type: "text", text: JSON.stringify(output) }] };
      }
    },
  };
}

export const auditTool = createAuditTool();
