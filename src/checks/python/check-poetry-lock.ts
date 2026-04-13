import { existsSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../../types";

const POETRY_ARTIFACTS = ["requirements.txt", "Pipfile", "Pipfile.lock"];

export async function checkPoetryLock(projectPath: string): Promise<CheckResult> {
  const lockPath = join(projectPath, "poetry.lock");

  const conflictingFiles = POETRY_ARTIFACTS.filter((f) =>
    existsSync(join(projectPath, f))
  );

  if (!existsSync(lockPath)) {
    const hasConflicts  = conflictingFiles.length > 0;
    const conflictNote  = hasConflicts
      ? ` — se eliminarán: ${conflictingFiles.join(", ")}`
      : "";

    return {
      name: "poetry.lock",
      status: "error",
      message: `poetry.lock no encontrado${conflictNote}`,
      fixable: true,
      fix: async () => {
        const { applyPoetryLock } = await import("../../fixer/apply");
        await applyPoetryLock(projectPath);
      },
    };
  }

  const file = Bun.file(lockPath);
  const size = file.size;

  if (size < 50) {
    return {
      name: "poetry.lock",
      status: "warn",
      message: "poetry.lock parece estar vacío o corrupto",
    };
  }

  return {
    name: "poetry.lock",
    status: "ok",
    message: `Lockfile presente (${(size / 1024).toFixed(1)} KB)`,
  };
}
