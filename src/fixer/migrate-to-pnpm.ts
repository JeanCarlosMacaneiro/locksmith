import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

export async function migrateToPnpm(projectPath: string): Promise<void> {
  await $`corepack enable`.cwd(projectPath).nothrow();
  await $`corepack install -g pnpm@latest`.cwd(projectPath).nothrow();

  const hasPackageLock = existsSync(join(projectPath, "package-lock.json"));
  const hasYarnLock = existsSync(join(projectPath, "yarn.lock"));

  // pnpm import supports package-lock.json and yarn.lock (not bun.lock)
  if (hasPackageLock || hasYarnLock) {
    await $`pnpm import`.cwd(projectPath).nothrow();
  }

  await $`pnpm install --ignore-scripts`.cwd(projectPath);

  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const version = (await $`pnpm --version`.text()).trim();
  pkg.packageManager = `pnpm@${version}`;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  if (hasPackageLock) rmSync(join(projectPath, "package-lock.json"), { force: true });
  if (hasYarnLock) rmSync(join(projectPath, "yarn.lock"), { force: true });

  // Remove bun.lock if present — pnpm-lock.yaml is now authoritative
  const hasBunLock = existsSync(join(projectPath, "bun.lock"));
  const hasBunLockb = existsSync(join(projectPath, "bun.lockb"));
  if (hasBunLock) rmSync(join(projectPath, "bun.lock"), { force: true });
  if (hasBunLockb) rmSync(join(projectPath, "bun.lockb"), { force: true });
}
