import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

const MIN_MAJOR = 18; // Node 18 is the oldest supported LTS

export async function checkNodeVersion(projectPath: string): Promise<CheckResult> {
  const nvmrcPath   = join(projectPath, ".nvmrc");
  const nodeVerPath = join(projectPath, ".node-version");
  const pkgPath     = join(projectPath, "package.json");

  // ── .nvmrc ────────────────────────────────────────────────────────────────
  if (existsSync(nvmrcPath)) {
    const version = readFileSync(nvmrcPath, "utf-8").trim().replace(/^v/, "");
    const major   = parseInt(version.split(".")[0] ?? "0");

    if (major < MIN_MAJOR) {
      return {
        name: "node version",
        status: "warn",
        message: `Node ${version} pinned in .nvmrc — >= ${MIN_MAJOR} recommended`,
        fixable: true,
        fix: async () => {
          const { applyNodeVersion } = await import("../fixer/apply");
          await applyNodeVersion(projectPath);
        },
      };
    }

    return {
      name: "node version",
      status: "ok",
      message: `Version pinned in .nvmrc: ${version}`,
    };
  }

  // ── .node-version ─────────────────────────────────────────────────────────
  if (existsSync(nodeVerPath)) {
    const version = readFileSync(nodeVerPath, "utf-8").trim().replace(/^v/, "");
    return {
      name: "node version",
      status: "ok",
      message: `Version pinned in .node-version: ${version}`,
    };
  }

  // ── package.json engines.node ─────────────────────────────────────────────
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const enginesNode: string | undefined = pkg.engines?.node;

    if (enginesNode) {
      return {
        name: "node version",
        status: "ok",
        message: `Version pinned in engines.node: ${enginesNode}`,
      };
    }
  }

  return {
    name: "node version",
    status: "warn",
    message: "Node version not pinned — use .nvmrc, .node-version or engines.node in package.json",
    fixable: true,
    fix: async () => {
      const { applyNodeVersion } = await import("../fixer/apply");
      await applyNodeVersion(projectPath);
    },
  };
}
