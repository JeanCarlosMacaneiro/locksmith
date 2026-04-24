import { z } from "zod";
import { detectProject } from "../../checks/detect-project";
import { runChecks } from "../../checks/index";
import { applyFixes } from "../../fixer/apply";
import type { ToolDefinition, FixOutput, McpErrorOutput } from "../types";
import { serializeCheckResult } from "../types";

export function createFixTool(deps = {
  detectProject,
  runChecks,
  applyFixes,
}): ToolDefinition {
  return {
    name: "locksmith_fix",
    description:
      "Apply automatic fixes to security issues found in a project. " +
      "Always call locksmith_audit first, then apply fixes only after explicit user approval. " +
      "Returns the post-fix audit state plus which checks were corrected.",
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

        const before = await deps.runChecks(projectPath, project.type);
        await deps.applyFixes(before, projectPath);
        const after = await deps.runChecks(projectPath, project.type);

        const fixedChecks = before
          .map((b, i) => ({ before: b, after: after[i]! }))
          .filter(({ before: b, after: a }) => b.status !== "ok" && a.status === "ok")
          .map(({ after: a }) => a.name);

        const serialized = after.map(serializeCheckResult);
        const summary = {
          ok: serialized.filter((c) => c.status === "ok").length,
          warn: serialized.filter((c) => c.status === "warn").length,
          error: serialized.filter((c) => c.status === "error").length,
        };

        const output: FixOutput = {
          projectType: project.type,
          projectName: project.name,
          summary,
          checks: serialized,
          hasErrors: summary.error > 0,
          hasWarnings: summary.warn > 0,
          fixableCount: serialized.filter((c) => c.fixable).length,
          fixedChecks,
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

export const fixTool = createFixTool();
