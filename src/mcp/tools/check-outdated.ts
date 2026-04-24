import { z } from "zod";
import { detectProject } from "../../checks/detect-project";
import { runOutdatedCheck } from "../../outdated/index";
import type { ToolDefinition, OutdatedOutput } from "../types";

export function createCheckOutdatedTool(deps = {
  detectProject,
  runOutdatedCheck,
}): ToolDefinition {
  return {
    name: "locksmith_check_outdated",
    description:
      "Check for outdated packages in a project, respecting the renovate.json policy if present. " +
      "Returns packages with age, update type, and whether policy delays are met.",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory"),
    },
    async handler(args) {
      const projectPath = args.projectPath as string;
      try {
        const project = await deps.detectProject(projectPath);
        const { packages, policy } = await deps.runOutdatedCheck(projectPath, project.type);

        const output: OutdatedOutput = {
          packages,
          totalOutdated: packages.length,
          safeToUpdate: packages.filter((p) => p.safeToUpdate).length,
          policyMet: packages.filter((p) => p.policyMet === true).length,
        };

        if (!policy.hasConfig) {
          output.warning =
            "No se encontró renovate.json — usando delays por defecto (patch: 3d, minor: 7d, major: 30d)";
        }

        return { content: [{ type: "text", text: JSON.stringify(output) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "INTERNAL_ERROR", message: String(err) }) }],
        };
      }
    },
  };
}

export const checkOutdatedTool = createCheckOutdatedTool();
