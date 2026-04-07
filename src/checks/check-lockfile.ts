import { existsSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

export async function checkLockfile(projectPath: string): Promise<CheckResult> {
  const lockPath = join(projectPath, "pnpm-lock.yaml");

  if (!existsSync(lockPath)) {
    return {
      name: "pnpm-lock.yaml",
      status: "error",
      message: "pnpm-lock.yaml no encontrado — ejecuta pnpm install",
      fixable: true,
      fix: async () => {
        const { $ } = await import("bun");
        await $`pnpm install --no-frozen-lockfile`.cwd(projectPath);
      },
    };
  }

  // Verificar que el lockfile no está vacío
  const file = Bun.file(lockPath);
  const size = file.size;

  if (size < 50) {
    return {
      name: "pnpm-lock.yaml",
      status: "warn",
      message: "pnpm-lock.yaml parece estar vacío o corrupto",
    };
  }

  return {
    name: "pnpm-lock.yaml",
    status: "ok",
    message: `Lockfile presente (${(size / 1024).toFixed(1)} KB)`,
  };
}
