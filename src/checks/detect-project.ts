import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { ProjectInfo } from "../types";

export async function detectProject(projectPath: string): Promise<ProjectInfo> {
  const pkgPath = join(projectPath, "package.json");
  const hasBunLockb = existsSync(join(projectPath, "bun.lockb"));
  const hasPackageJson = existsSync(pkgPath);

  if (!hasPackageJson) {
    return { valid: false, type: "unknown", name: "", version: "", hasBunLockb, hasPackageJson };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const type = hasBunLockb ? "bun" : "node";

  return {
    valid: true,
    type,
    name: pkg.name ?? "unnamed",
    version: pkg.version ?? "0.0.0",
    hasBunLockb,
    hasPackageJson,
  };
}
