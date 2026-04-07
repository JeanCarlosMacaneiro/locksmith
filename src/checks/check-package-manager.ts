import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

// Formato esperado: "pnpm@X.Y.Z"
const PACKAGE_MANAGER_REGEX = /^pnpm@\d+\.\d+\.\d+$/;

export async function checkPackageManager(projectPath: string): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");

  if (!existsSync(pkgPath)) {
    return { name: "packageManager", status: "warn", message: "package.json no encontrado" };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const field: string | undefined = pkg.packageManager;

  if (!field) {
    return {
      name: "packageManager",
      status: "warn",
      message:
        'Campo "packageManager" ausente — versión de pnpm no fijada (ej: "pnpm@9.1.0")',
      fixable: true,
      fix: async () => {
        const { applyPackageManager } = await import("../fixer/apply");
        await applyPackageManager(projectPath);
      },
    };
  }

  if (!PACKAGE_MANAGER_REGEX.test(field)) {
    return {
      name: "packageManager",
      status: "error",
      message: `Formato inválido: "${field}" — debe ser "pnpm@X.Y.Z"`,
      fixable: true,
      fix: async () => {
        const { applyPackageManager } = await import("../fixer/apply");
        await applyPackageManager(projectPath);
      },
    };
  }

  if (!field.startsWith("pnpm@")) {
    return {
      name: "packageManager",
      status: "error",
      message: `Se requiere pnpm, encontrado: "${field}"`,
      fixable: false,
    };
  }

  return {
    name: "packageManager",
    status: "ok",
    message: `Versión fijada: ${field}`,
  };
}
