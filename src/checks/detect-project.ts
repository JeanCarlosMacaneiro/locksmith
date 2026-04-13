import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { ProjectInfo } from "../types";

export async function detectProject(projectPath: string): Promise<ProjectInfo> {
  const pkgPath      = join(projectPath, "package.json");
  const pyprojectPath = join(projectPath, "pyproject.toml");
  const hasBunLockb  = existsSync(join(projectPath, "bun.lockb"));
  const hasPackageJson = existsSync(pkgPath);
  const hasPyproject   = existsSync(pyprojectPath);

  // ── Python project ────────────────────────────────────────────────────────
  if (hasPyproject && !hasPackageJson) {
    const content = readFileSync(pyprojectPath, "utf-8");
    const nameMatch    = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const versionMatch = content.match(/^\s*version\s*=\s*"([^"]+)"/m);

    return {
      valid: true,
      type: "python",
      name: nameMatch?.[1] ?? "unnamed",
      version: versionMatch?.[1] ?? "0.0.0",
      hasBunLockb: false,
      hasPackageJson: false,
      hasPyproject: true,
    };
  }

  // ── Node / Bun project ────────────────────────────────────────────────────
  if (!hasPackageJson) {
    return {
      valid: false,
      type: "unknown",
      name: "",
      version: "",
      hasBunLockb,
      hasPackageJson,
      hasPyproject,
    };
  }

  const pkg  = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const type = hasBunLockb ? "bun" : "node";

  return {
    valid: true,
    type,
    name: pkg.name ?? "unnamed",
    version: pkg.version ?? "0.0.0",
    hasBunLockb,
    hasPackageJson,
    hasPyproject,
  };
}
