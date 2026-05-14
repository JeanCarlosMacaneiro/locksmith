import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult, ProjectType } from "../types";

const PNPM_REGEX = /^pnpm@\d+\.\d+\.\d+$/;
const BUN_REGEX  = /^bun@\d+\.\d+\.\d+$/;

export async function checkPackageManager(projectPath: string, type: ProjectType = "node"): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { name: "packageManager", status: "warn", message: "package.json not found" };
  }

  const pkg   = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const field = (pkg.packageManager ?? "") as string;

  // Bun type: packageManager: "bun@..." is expected (Option B — bun runtime, pnpm packages)
  if (type === "bun") {
    if (BUN_REGEX.test(field)) return { name: "packageManager", status: "ok", message: `Bun runtime pinned: ${field}` };
    if (!field) {
      return {
        name: "packageManager",
        status: "warn",
        message: '"packageManager" field missing in Bun project',
        fixable: true,
        fix: async () => { const { applyPackageManager } = await import("../fixer/apply"); await applyPackageManager(projectPath); },
      };
    }
  }

  // npm/yarn: must migrate to pnpm
  if (type === "npm" || type === "yarn") {
    if (PNPM_REGEX.test(field)) return { name: "packageManager", status: "ok", message: `Version pinned: ${field}` };
    return {
      name: "packageManager",
      status: "error",
      message: `Project uses ${type} — pnpm@11+ required for maximum security`,
      fixable: true,
      fix: async () => { const { migrateToPnpm } = await import("../fixer/migrate-to-pnpm"); await migrateToPnpm(projectPath); },
      hint: ["Run locksmith --fix to automatically migrate to pnpm 11"],
    };
  }

  // node/electron: require pnpm@X.Y.Z
  if (!field) {
    return {
      name: "packageManager",
      status: "warn",
      message: '"packageManager" field missing — pnpm version not pinned',
      fixable: true,
      fix: async () => { const { applyPackageManager } = await import("../fixer/apply"); await applyPackageManager(projectPath); },
    };
  }

  if (!PNPM_REGEX.test(field)) {
    return {
      name: "packageManager",
      status: "error",
      message: `Invalid format or wrong PM: "${field}" — must be "pnpm@X.Y.Z"`,
      fixable: true,
      fix: async () => { const { applyPackageManager } = await import("../fixer/apply"); await applyPackageManager(projectPath); },
    };
  }

  return { name: "packageManager", status: "ok", message: `Version pinned: ${field}` };
}
