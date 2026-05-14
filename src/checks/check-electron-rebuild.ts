import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

const REBUILD_PKGS = ["@electron/rebuild", "electron-rebuild"];

export async function checkElectronRebuild(projectPath: string): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { name: "electron-rebuild", status: "warn", message: "package.json not found" };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;

  const hasRebuildDep = REBUILD_PKGS.some((p) => p in devDeps);

  if (!hasRebuildDep) {
    return {
      name: "electron-rebuild",
      status: "warn",
      message: "@electron/rebuild not found in devDependencies",
      hint: ["Install: pnpm add -D @electron/rebuild", "Add explicit script: \"rebuild\": \"electron-rebuild\""],
    };
  }

  const postinstall = scripts.postinstall ?? "";
  if (REBUILD_PKGS.some((p) => postinstall.includes(p))) {
    return {
      name: "electron-rebuild",
      status: "error",
      message: "electron-rebuild in postinstall — runs uncontrolled on dependency install",
      fixable: true,
      fix: async () => {
        const { applyElectronRebuildFix } = await import("../fixer/apply");
        await applyElectronRebuildFix(projectPath);
      },
      hint: [
        "Move to explicit script: \"rebuild\": \"electron-rebuild\"",
        "Remove electron-rebuild from postinstall",
      ],
    };
  }

  return {
    name: "electron-rebuild",
    status: "ok",
    message: "@electron/rebuild configured — not in postinstall",
  };
}
