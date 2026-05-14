import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { ProjectInfo, ProjectType } from "../types";

export async function detectProject(projectPath: string): Promise<ProjectInfo> {
  const pkgPath       = join(projectPath, "package.json");
  const pyprojectPath = join(projectPath, "pyproject.toml");
  const hasPackageJson = existsSync(pkgPath);
  const hasPyproject   = existsSync(pyprojectPath);
  const hasBunLockb    = existsSync(join(projectPath, "bun.lockb")) || existsSync(join(projectPath, "bun.lock"));

  // ── Python project ────────────────────────────────────────────────────────
  if (hasPyproject && !hasPackageJson) {
    const content      = readFileSync(pyprojectPath, "utf-8");
    const nameMatch    = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const versionMatch = content.match(/^\s*version\s*=\s*"([^"]+)"/m);
    return {
      valid: true, type: "python", packageManager: "unknown",
      name: nameMatch?.[1] ?? "unnamed", version: versionMatch?.[1] ?? "0.0.0",
      hasBunLockb: false, hasPackageJson: false, hasPyproject: true,
    };
  }

  if (!hasPackageJson) {
    return {
      valid: false, type: "unknown", packageManager: "unknown",
      name: "", version: "", hasBunLockb, hasPackageJson, hasPyproject,
    };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const deps    = (pkg.dependencies    ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  const pmField = (pkg.packageManager  ?? "") as string;

  const hasYarnLock    = existsSync(join(projectPath, "yarn.lock"));
  const hasPackageLock = existsSync(join(projectPath, "package-lock.json"));

  // ── Detect type — priority: electron > bun > yarn > npm > node ───────────
  const isElectron = "electron" in deps
    || "electron-builder" in devDeps
    || "electron-forge" in devDeps
    || "@electron-forge/cli" in devDeps;

  const isBun = hasBunLockb || pmField.startsWith("bun@");

  let type: ProjectType;
  let packageManager: ProjectInfo["packageManager"];

  if (isElectron) {
    type = "electron";
    // Electron can use any PM currently — detect which one
    if (existsSync(join(projectPath, "pnpm-lock.yaml"))) packageManager = "pnpm";
    else if (isBun)         packageManager = "bun";
    else if (hasYarnLock)   packageManager = "yarn";
    else if (hasPackageLock) packageManager = "npm";
    else                    packageManager = "pnpm"; // default target
  } else if (isBun) {
    type = "bun";
    packageManager = "bun";
  } else if (hasYarnLock) {
    type = "yarn";
    packageManager = "yarn";
  } else if (hasPackageLock) {
    type = "npm";
    packageManager = "npm";
  } else {
    type = "node";
    packageManager = "pnpm";
  }

  return {
    valid: true, type, packageManager,
    name: (pkg.name as string | undefined) ?? "unnamed",
    version: (pkg.version as string | undefined) ?? "0.0.0",
    hasBunLockb, hasPackageJson, hasPyproject,
  };
}
