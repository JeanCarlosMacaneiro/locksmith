import { existsSync } from "fs";
import { join } from "path";
import type { CheckResult, ProjectType } from "../types";

export async function checkLockfile(projectPath: string, type: ProjectType = "node"): Promise<CheckResult> {
  const lockPath = join(projectPath, "pnpm-lock.yaml");

  if (existsSync(lockPath)) {
    const file = Bun.file(lockPath);
    const size = file.size;
    if (size < 50) {
      return { name: "pnpm-lock.yaml", status: "warn", message: "pnpm-lock.yaml parece vacío o corrupto" };
    }
    return { name: "pnpm-lock.yaml", status: "ok", message: `Lockfile presente (${(size / 1024).toFixed(1)} KB)` };
  }

  const sourceNote = type === "npm"  ? " — package-lock.json detectado, ejecuta --fix para migrar a pnpm"
    : type === "yarn"                ? " — yarn.lock detectado, ejecuta --fix para migrar a pnpm"
    : type === "bun"                 ? " — bun.lock detectado, ejecuta --fix para usar pnpm como gestor de paquetes"
    : "";

  return {
    name: "pnpm-lock.yaml",
    status: "error",
    message: `pnpm-lock.yaml no encontrado${sourceNote}`,
    fixable: true,
    fix: async () => {
      const { migrateToPnpm } = await import("../fixer/migrate-to-pnpm");
      await migrateToPnpm(projectPath);
    },
    hint: ["Ejecuta locksmith --fix para migrar automáticamente a pnpm 11"],
  };
}
