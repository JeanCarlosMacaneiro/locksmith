import { z } from "zod";
import { writeFileSync } from "fs";
import { detectProject } from "../../checks/detect-project";
import { analyzeDockerfile } from "../../docker/analyze-dockerfile";
import type { ToolDefinition, DockerFixOutput } from "../types";

export function createFixDockerfileTool(deps = {
  detectProject,
  analyzeDockerfile,
  writeFileSync,
}): ToolDefinition {
  return {
    name: "locksmith_fix_dockerfile",
    description:
      "Apply automatic fixes to Dockerfile security issues in a project. " +
      "Only call after explicit user approval. Returns how many issues were fixed.",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory"),
    },
    async handler(args) {
      const projectPath = args.projectPath as string;
      try {
        const project = await deps.detectProject(projectPath);
        const analyses = deps.analyzeDockerfile(projectPath, project.type);

        if (analyses.length === 0 || !analyses[0]!.found) {
          const output: DockerFixOutput = { fixed: false, issuesFixed: 0, dockerfilePath: null };
          return { content: [{ type: "text", text: JSON.stringify(output) }] };
        }

        let issuesFixed = 0;
        let lastDockerfilePath: string | null = null;

        for (const analysis of analyses) {
          if (!analysis.found || !analysis.dockerfilePath) continue;
          lastDockerfilePath = analysis.dockerfilePath;

          if (analysis.proposedContent !== null) {
            deps.writeFileSync(analysis.dockerfilePath, analysis.proposedContent, "utf-8");
            issuesFixed += analysis.issues.filter((i) => i.replacement !== null).length;
          }
        }

        const output: DockerFixOutput = {
          fixed: issuesFixed > 0,
          issuesFixed,
          dockerfilePath: lastDockerfilePath,
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

export const fixDockerfileTool = createFixDockerfileTool();
