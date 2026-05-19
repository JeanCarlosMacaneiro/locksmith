import { z } from "zod";
import { resolveVersion, fetchPackageJson } from "../../add/registry-client";
import { inspectScripts } from "../../add/script-inspector";
import { querySocket } from "../../add/socket-client";
import { determineRiskLevel } from "../../add/security-report";
import { installPackage } from "../../add/installer";
import { resolvePyPIVersion, fetchPyPIInfo } from "../../add/pypi-client";
import type { PyPIInfo } from "../../add/pypi-client";
import { inspectPyPIMetadata } from "../../add/python-inspector";
import { installPythonPackage } from "../../add/python-installer";
import { detectEcosystem } from "../../add/index";
import { RegistryError } from "../../types";
import type { DangerousScript, SocketScore } from "../../types";
import type { ToolDefinition, SafeAddOutput, McpErrorOutput } from "../types";
import { validateProjectPath } from "../validate-path";

interface SafeAddDeps {
  resolveVersion: (pkg: string) => Promise<string>;
  fetchPackageJson: (pkg: string, version: string) => Promise<Record<string, unknown>>;
  inspectScripts: (pkgJson: Record<string, unknown>) => DangerousScript[];
  querySocket: (pkg: string, version: string) => Promise<SocketScore | null>;
  determineRiskLevel: (scripts: DangerousScript[], score: SocketScore | undefined) => "none" | "medium" | "critical";
  installPackage: (pkg: string, version: string, path: string) => Promise<void>;
  resolvePyPIVersion: (pkg: string) => Promise<string>;
  fetchPyPIInfo: (pkg: string, version?: string) => Promise<PyPIInfo>;
  inspectPyPIMetadata: (info: Pick<PyPIInfo, "summary" | "description">) => DangerousScript[];
  installPythonPackage: (pkg: string, version: string, path: string) => Promise<void>;
  detectEcosystem: (path: string) => "node" | "python" | null;
}

const defaultDeps: SafeAddDeps = {
  resolveVersion,
  fetchPackageJson,
  inspectScripts,
  querySocket,
  determineRiskLevel,
  installPackage,
  resolvePyPIVersion,
  fetchPyPIInfo,
  inspectPyPIMetadata,
  installPythonPackage,
  detectEcosystem,
};

export function createSafeAddTool(deps: SafeAddDeps = defaultDeps): ToolDefinition {
  return {
    name: "locksmith_safe_add",
    description:
      "Inspect a package's security before installing it. Auto-detects Node.js (npm/pnpm) and Python (PyPI/poetry) projects. " +
      "For Node: checks lifecycle scripts for dangerous patterns and queries Socket.dev for supply chain risk. " +
      "For Python: checks PyPI metadata for dangerous patterns. " +
      "If riskLevel is 'critical', installation is blocked. " +
      "Set install: true to proceed with installation (only for non-critical packages).",
    inputSchema: {
      projectPath: z.string().describe("Absolute path to the project directory"),
      package: z
        .string()
        .describe("Package name, optionally with version (lodash@4.17.21 for Node; requests==2.31.0 or requests@2.31.0 for Python)"),
      install: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true and risk is not critical, install the package via pnpm (Node) or poetry (Python)"),
    },
    async handler(args) {
      const projectPath = validateProjectPath(args.projectPath as string);
      const pkgArg = args.package as string;
      const shouldInstall = args.install === true;

      try {
        const ecosystem = deps.detectEcosystem(projectPath);

        if (ecosystem === "python") {
          return await handlePython(pkgArg, projectPath, shouldInstall, deps);
        }

        return await handleNode(pkgArg, projectPath, shouldInstall, deps);
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

async function handleNode(
  pkgArg: string,
  projectPath: string,
  shouldInstall: boolean,
  deps: SafeAddDeps,
) {
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
        message: `Package not found in the npm registry: ${pkgName}`,
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
    ecosystem: "node",
  };

  return { content: [{ type: "text", text: JSON.stringify(output) }] };
}

async function handlePython(
  pkgArg: string,
  projectPath: string,
  shouldInstall: boolean,
  deps: SafeAddDeps,
) {
  // Support pkg@version (npm-style) and pkg==version (pip-style)
  const eqIdx = pkgArg.indexOf("==");
  const atIdx = pkgArg.lastIndexOf("@");
  let pkgName: string;
  let requestedVersion: string | undefined;

  if (eqIdx > 0) {
    pkgName = pkgArg.slice(0, eqIdx);
    requestedVersion = pkgArg.slice(eqIdx + 2);
  } else if (atIdx > 0) {
    pkgName = pkgArg.slice(0, atIdx);
    requestedVersion = pkgArg.slice(atIdx + 1);
  } else {
    pkgName = pkgArg;
  }

  let resolvedVersion: string;
  try {
    resolvedVersion = requestedVersion ?? (await deps.resolvePyPIVersion(pkgName));
  } catch (err) {
    if (err instanceof RegistryError && err.code === "not_found") {
      const output: McpErrorOutput = {
        error: "PACKAGE_NOT_FOUND",
        message: `Package not found in PyPI: ${pkgName}`,
      };
      return { content: [{ type: "text", text: JSON.stringify(output) }] };
    }
    throw err;
  }

  const pypiInfo = await deps.fetchPyPIInfo(pkgName, resolvedVersion);
  const dangerousScripts = deps.inspectPyPIMetadata(pypiInfo);
  const riskLevel = deps.determineRiskLevel(dangerousScripts, undefined);

  let installed = false;
  if (shouldInstall && riskLevel !== "critical") {
    await deps.installPythonPackage(pkgName, resolvedVersion, projectPath);
    installed = true;
  }

  const output: SafeAddOutput = {
    name: pkgName,
    resolvedVersion,
    riskLevel,
    dangerousScripts,
    socketScore: null,
    installed,
    ecosystem: "python",
  };

  return { content: [{ type: "text", text: JSON.stringify(output) }] };
}

export const safeAddTool = createSafeAddTool();
