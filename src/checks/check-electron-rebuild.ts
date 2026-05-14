import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

const REBUILD_PKGS = ["@electron/rebuild", "electron-rebuild"];

export async function checkElectronRebuild(projectPath: string): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { name: "electron-rebuild", status: "warn", message: "package.json no encontrado" };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;

  const hasRebuildDep = REBUILD_PKGS.some((p) => p in devDeps);

  if (!hasRebuildDep) {
    return {
      name: "electron-rebuild",
      status: "warn",
      message: "@electron/rebuild no encontrado en devDependencies",
      hint: ["Instala: pnpm add -D @electron/rebuild", "Agrega script explícito: \"rebuild\": \"electron-rebuild\""],
    };
  }

  const postinstall = scripts.postinstall ?? "";
  if (REBUILD_PKGS.some((p) => postinstall.includes(p))) {
    return {
      name: "electron-rebuild",
      status: "error",
      message: "electron-rebuild en postinstall — ejecuta sin control al instalar dependencias",
      fixable: true,
      fix: async () => {
        const { applyElectronRebuildFix } = await import("../fixer/apply");
        await applyElectronRebuildFix(projectPath);
      },
      hint: [
        "Mueve a script explícito: \"rebuild\": \"electron-rebuild\"",
        "Elimina electron-rebuild del postinstall",
      ],
    };
  }

  return {
    name: "electron-rebuild",
    status: "ok",
    message: "@electron/rebuild configurado — no en postinstall",
  };
}
