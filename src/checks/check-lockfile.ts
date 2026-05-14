import { existsSync } from "fs";
import { join } from "path";
import type { CheckResult, ProjectType } from "../types";

export async function checkLockfile(projectPath: string, type: ProjectType = "node"): Promise<CheckResult> {
  const lockPath = join(projectPath, "pnpm-lock.yaml");

  if (existsSync(lockPath)) {
    const file = Bun.file(lockPath);
    const size = file.size;
    if (size < 50) {
      return { name: "pnpm-lock.yaml", status: "warn", message: "pnpm-lock.yaml appears empty or corrupt" };
    }
    return { name: "pnpm-lock.yaml", status: "ok", message: `Lockfile present (${(size / 1024).toFixed(1)} KB)` };
  }

  const sourceNote = type === "npm"  ? " — package-lock.json detected, run --fix to migrate to pnpm"
    : type === "yarn"                ? " — yarn.lock detected, run --fix to migrate to pnpm"
    : type === "bun"                 ? " — bun.lock detected, run --fix to use pnpm as package manager"
    : "";

  return {
    name: "pnpm-lock.yaml",
    status: "error",
    message: `pnpm-lock.yaml not found${sourceNote}`,
    fixable: true,
    fix: async () => {
      const { migrateToPnpm } = await import("../fixer/migrate-to-pnpm");
      await migrateToPnpm(projectPath);
    },
    hint: ["Run locksmith --fix to automatically migrate to pnpm 11"],
  };
}
