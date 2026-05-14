import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

export async function checkScripts(projectPath: string): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");

  if (!existsSync(pkgPath)) {
    return { name: "project scripts", status: "warn", message: "package.json not found" };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const scripts: Record<string, string> = pkg.scripts ?? {};

  const missingLocksmith = !Object.values(scripts).some((v) => v.includes("locksmith"));
  const missingFrozen    = !Object.values(scripts).some((v) => v.includes("--frozen-lockfile"));

  const missing: string[] = [];
  if (missingLocksmith) missing.push("locksmith (security audit)");
  if (missingFrozen)    missing.push("pnpm install --frozen-lockfile");

  if (missing.length === 0) {
    return {
      name: "project scripts",
      status: "ok",
      message: "Security and install scripts configured",
    };
  }

  return {
    name: "project scripts",
    status: "warn",
    message: `Missing scripts: ${missing.join(", ")}`,
    fixable: true,
    fix: async () => {
      const { applyLocksmithScripts } = await import("../fixer/apply");
      await applyLocksmithScripts(projectPath);
    },
  };
}
