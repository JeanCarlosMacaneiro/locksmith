import { z } from "zod";
import { resolveVersion, fetchPackageJson } from "../../add/registry-client";
import { inspectScripts } from "../../add/script-inspector";
import { querySocket } from "../../add/socket-client";
import { determineRiskLevel } from "../../add/security-report";
import { installPackage } from "../../add/installer";
import { RegistryError } from "../../types";
import type { ToolDefinition, SafeAddOutput, McpErrorOutput } from "../types";

export function createSafeAddTool(deps = {
  resolveVersion,
  fetchPackageJson,
  inspectScripts,
  querySocket,
  determineRiskLevel,
  installPackage,
}): ToolDefinition {
  return {
    name: "locksmith_safe_add",
    description:
      "Inspect a package's security before installing it. Checks lifecycle scripts for dangerous patterns " +
      "and queries Socket.dev for supply chain risk. If riskLevel is 'critical', installation is blocked. " +
      "Set install: true to proceed with installation (only for non-critical packages).",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory"),
      package: z
        .string()
        .describe("Package name, optionally with version (e.g. lodash or lodash@4.17.21)"),
      install: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true and risk is not critical, install the package via pnpm"),
    },
    async handler(args) {
      const projectPath = args.projectPath as string;
      const pkgArg = args.package as string;
      const shouldInstall = args.install === true;

      try {
        const atIdx = pkgArg.lastIndexOf("@");
        const hasVersion = atIdx > 0;
        const pkgName = hasVersion ? pkgArg.slice(0, atIdx) : pkgArg;
        const requestedVersion = hasVersion ? pkgArg.slice(atIdx + 1) : undefined;

        let resolvedVersion: string;
        try {
          resolvedVersion = requestedVersion ?? (await deps.resolveVersion(pkgName));
        } catch (err) {
          if (err instanceof RegistryError && err.code === "not_found") {
            const output: McpErrorOutput = {
              error: "PACKAGE_NOT_FOUND",
              message: `Paquete no encontrado en el registry npm: ${pkgName}`,
            };
            return { content: [{ type: "text", text: JSON.stringify(output) }] };
          }
          throw err;
        }

        const pkgJson = await deps.fetchPackageJson(pkgName, resolvedVersion);
        const dangerousScripts = deps.inspectScripts(pkgJson);
        const socketScore = await deps.querySocket(pkgName, resolvedVersion);
        const riskLevel = deps.determineRiskLevel(dangerousScripts, socketScore ?? undefined);

        let installed = false;
        if (shouldInstall && riskLevel !== "critical") {
          await deps.installPackage(pkgName, resolvedVersion, projectPath);
          installed = true;
        }

        const output: SafeAddOutput = {
          name: pkgName,
          resolvedVersion,
          riskLevel,
          dangerousScripts,
          socketScore: socketScore ?? null,
          installed,
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

export const safeAddTool = createSafeAddTool();
