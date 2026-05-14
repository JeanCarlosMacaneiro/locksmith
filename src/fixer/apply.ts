import { writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import pc from "picocolors";
import type { CheckResult } from "../types";

export async function applyFixes(results: CheckResult[], projectPath: string) {
  const fixable = results.filter((r) => r.status !== "ok" && r.fixable && r.fix);

  if (fixable.length === 0) {
    console.log(pc.dim("  No automatic fixes available.\n"));
    return;
  }

  console.log(pc.bold(`\n🔧 Applying ${fixable.length} fix(es)...\n`));

  for (const r of fixable) {
    try {
      await r.fix!();
      console.log(pc.green(`  ✓ ${r.name} fixed`));
    } catch (e) {
      console.error(pc.red(`  ✗ Error fixing ${r.name}: ${e}`));
    }
  }

  console.log();
}

export async function applyNpmrc(projectPath: string) {
  const template = await Bun.file(
    join(import.meta.dir, "../../templates/.npmrc")
  ).text();
  writeFileSync(join(projectPath, ".npmrc"), template);
}

export async function applyRenovate(projectPath: string) {
  const template = await Bun.file(
    join(import.meta.dir, "../../templates/renovate.json")
  ).text();
  writeFileSync(join(projectPath, "renovate.json"), template);
}

export async function applyOnlyBuiltDeps(projectPath: string) {
  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.pnpm = { ...(pkg.pnpm ?? {}), onlyBuiltDependencies: [] };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

export async function applyOnlyAllow(projectPath: string) {
  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.scripts = { ...(pkg.scripts ?? {}), preinstall: "npx only-allow pnpm" };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

export async function applyLockfile(projectPath: string) {
  const { $ } = await import("bun");

  // Remove npm/yarn artifacts that conflict with pnpm
  const artifacts = ["node_modules", "package-lock.json", "yarn.lock"];
  for (const item of artifacts) {
    const fullPath = join(projectPath, item);
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true, force: true });
    }
  }

  await $`pnpm install --no-frozen-lockfile --ignore-scripts`.cwd(projectPath);
}

// ─── Python fixers ────────────────────────────────────────────────────────────

export async function applyPyproject(projectPath: string) {
  const { $ } = await import("bun");
  const pyprojectPath = join(projectPath, "pyproject.toml");

  if (!existsSync(pyprojectPath)) {
    // Initialize Poetry project non-interactively
    await $`poetry init --no-interaction --python ">=3.12"`.cwd(projectPath);
  } else {
    // Patch requires-python if missing or wrong
    let content = readFileSync(pyprojectPath, "utf-8");
    if (!content.match(/^\s*python\s*=/m)) {
      content = content.replace(
        /(\[tool\.poetry\.dependencies\])/,
        '$1\npython = ">=3.12"'
      );
      writeFileSync(pyprojectPath, content);
    }
  }
}

export async function applyPoetryToml(projectPath: string) {
  const template = await Bun.file(
    join(import.meta.dir, "../../templates/poetry.toml")
  ).text();
  writeFileSync(join(projectPath, "poetry.toml"), template);
}

export async function applyPoetryLock(projectPath: string) {
  const { $ } = await import("bun");

  // Remove pip/pipenv artifacts that conflict with Poetry
  const artifacts = [".venv", "requirements.txt", "Pipfile", "Pipfile.lock"];
  for (const item of artifacts) {
    const fullPath = join(projectPath, item);
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true, force: true });
    }
  }

  await $`poetry install --no-interaction`.cwd(projectPath);
}

export async function applyPythonVersion(projectPath: string) {
  writeFileSync(join(projectPath, ".python-version"), "3.12.7\n");
}

export async function applyDepGroups(projectPath: string) {
  const { $ } = await import("bun");
  // Ensure dev group exists — Poetry creates it on first dev add
  await $`poetry add --group dev --no-interaction pytest`.cwd(projectPath);
}

export async function applyPypiSource(projectPath: string) {
  const pyprojectPath = join(projectPath, "pyproject.toml");
  let content = readFileSync(pyprojectPath, "utf-8");
  // Remove all [[tool.poetry.source]] blocks that are not pypi.org
  content = content.replace(/\[\[tool\.poetry\.source\]\][\s\S]*?(?=\[\[|$)/g, (block) => {
    if (block.includes("https://pypi.org")) return block;
    return "";
  });
  writeFileSync(pyprojectPath, content.trim() + "\n");
}

// ─── Node fixers ──────────────────────────────────────────────────────────────

export async function applyLocksmithScripts(projectPath: string) {
  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  const existing: Record<string, string> = pkg.scripts ?? {};

  const hasLocksmith = Object.values(existing).some((v) => v.includes("locksmith"));
  const hasFrozen    = Object.values(existing).some((v) => v.includes("--frozen-lockfile"));

  const toAdd: Record<string, string> = {};

  if (!hasLocksmith) {
    toAdd["security"]       = "locksmith .";
    toAdd["security:fix"]   = "locksmith . --fix";
    toAdd["security:ci"]    = "locksmith . --strict";
  }

  if (!hasFrozen) {
    toAdd["install:ci"]   = "pnpm install --frozen-lockfile --ignore-scripts";
  }

  pkg.scripts = { ...existing, ...toAdd };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

export async function applyPackageManager(projectPath: string) {
  const { $ } = await import("bun");
  const version = (await $`pnpm --version`.text()).trim();
  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.packageManager = `pnpm@${version}`;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

export async function applyNodeVersion(projectPath: string) {
  const { $ } = await import("bun");
  const version = (await $`node --version`.text()).trim().replace(/^v/, "");
  writeFileSync(join(projectPath, ".nvmrc"), `${version}\n`);
}

// ─── Electron fixers ─────────────────────────────────────────────────────────

export async function applyElectronRebuildFix(projectPath: string) {
  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const scripts: Record<string, string> = pkg.scripts ?? {};

  const REBUILD_PKGS = ["electron-rebuild", "@electron/rebuild"];
  const postinstall: string = scripts.postinstall ?? "";
  const hasRebuildInPostinstall = REBUILD_PKGS.some((p) => postinstall.includes(p));

  if (hasRebuildInPostinstall) {
    // Remove electron-rebuild from postinstall
    const cleaned = postinstall
      .split("&&")
      .map((s) => s.trim())
      .filter((s) => !REBUILD_PKGS.some((p) => s.includes(p)))
      .join(" && ")
      .trim();
    scripts.postinstall = cleaned || undefined as unknown as string;
    if (!cleaned) delete scripts.postinstall;
  }

  if (!scripts.rebuild) {
    const rebuildBin = "@electron/rebuild" in (pkg.devDependencies ?? {}) ? "electron-rebuild" : "electron-rebuild";
    scripts.rebuild = rebuildBin;
  }

  pkg.scripts = scripts;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

// ─── Shared fixers ────────────────────────────────────────────────────────────

const GITIGNORE_SECURITY_PATTERNS = [
  "# Security — added by locksmith",
  ".env",
  ".env.*",
  ".env*.local",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.crt",
].join("\n");

export async function applyGitignore(projectPath: string) {
  const { existsSync, readFileSync } = await import("fs");
  const gitignorePath = join(projectPath, ".gitignore");

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, GITIGNORE_SECURITY_PATTERNS + "\n");
    return;
  }

  const existing = readFileSync(gitignorePath, "utf-8");
  const toAdd = GITIGNORE_SECURITY_PATTERNS
    .split("\n")
    .filter((line) => line.startsWith("#") || (!existing.includes(line) && line.length > 0))
    .join("\n");

  writeFileSync(gitignorePath, existing.trimEnd() + "\n\n" + toAdd + "\n");
}
