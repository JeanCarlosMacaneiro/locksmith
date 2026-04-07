import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

export async function checkOnlyAllow(projectPath: string): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { name: "only-allow pnpm", status: "warn", message: "package.json no encontrado" };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const preinstall: string = pkg.scripts?.preinstall ?? "";

  if (!preinstall.includes("only-allow pnpm")) {
    return {
      name: "only-allow pnpm",
      status: "warn",
      message: 'scripts.preinstall no tiene "only-allow pnpm"',
      fixable: true,
      fix: async () => {
        const { applyOnlyAllow } = await import("../fixer/apply");
        await applyOnlyAllow(projectPath);
      },
    };
  }

  return {
    name: "only-allow pnpm",
    status: "ok",
    message: "Forzado: solo pnpm puede instalar dependencias",
  };
}
