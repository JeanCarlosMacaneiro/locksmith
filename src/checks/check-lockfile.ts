import { existsSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

const NPM_ARTIFACTS = ["package-lock.json", "yarn.lock"];

export async function checkLockfile(projectPath: string): Promise<CheckResult> {
  const lockPath = join(projectPath, "pnpm-lock.yaml");

  const conflictingFiles = NPM_ARTIFACTS.filter((f) => existsSync(join(projectPath, f)));

  if (!existsSync(lockPath)) {
    const hasConflicts = conflictingFiles.length > 0;
    const conflictNote = hasConflicts
      ? ` — se eliminarán: ${conflictingFiles.join(", ")} y node_modules/`
      : "";

    return {
      name: "pnpm-lock.yaml",
      status: "error",
      message: `pnpm-lock.yaml no encontrado${conflictNote}`,
      fixable: true,
      fix: async () => {
        const { applyLockfile } = await import("../fixer/apply");
        await applyLockfile(projectPath);
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
