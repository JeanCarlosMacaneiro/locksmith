import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

export async function checkBuiltDeps(projectPath: string): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) {
    return { name: "onlyBuiltDependencies", status: "warn", message: "package.json no encontrado" };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const pnpmConfig = pkg.pnpm ?? {};

  const hasOnly = Array.isArray(pnpmConfig.onlyBuiltDependencies);
  const hasNever = Array.isArray(pnpmConfig.neverBuiltDependencies);

  if (!hasOnly && !hasNever) {
    return {
      name: "onlyBuiltDependencies",
      status: "warn",
      message: "Sin allowlist de scripts — cualquier paquete puede ejecutar postinstall",
      fixable: true,
      fix: async () => {
        const { applyOnlyBuiltDeps } = await import("../fixer/apply");
        await applyOnlyBuiltDeps(projectPath);
      },
    };
  }

  const list = hasOnly ? pnpmConfig.onlyBuiltDependencies : pnpmConfig.neverBuiltDependencies;
  const key = hasOnly ? "onlyBuiltDependencies" : "neverBuiltDependencies";

  return {
    name: "onlyBuiltDependencies",
    status: "ok",
    message: `${key}: [${list.join(", ")}]`,
  };
}
