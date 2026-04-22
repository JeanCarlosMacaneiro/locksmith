import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

export async function checkScripts(projectPath: string): Promise<CheckResult> {
  const pkgPath = join(projectPath, "package.json");

  if (!existsSync(pkgPath)) {
    return { name: "scripts de proyecto", status: "warn", message: "package.json no encontrado" };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const scripts: Record<string, string> = pkg.scripts ?? {};

  const missingLocksmith = !Object.values(scripts).some((v) => v.includes("locksmith"));
  const missingFrozen    = !Object.values(scripts).some((v) => v.includes("--frozen-lockfile"));

  const missing: string[] = [];
  if (missingLocksmith) missing.push("locksmith (auditoría de seguridad)");
  if (missingFrozen)    missing.push("pnpm install --frozen-lockfile");

  if (missing.length === 0) {
    return {
      name: "scripts de proyecto",
      status: "ok",
      message: "Scripts de seguridad e instalación configurados",
    };
  }

  return {
    name: "scripts de proyecto",
    status: "warn",
    message: `Faltan scripts: ${missing.join(", ")}`,
    fixable: true,
    fix: async () => {
      const { applyLocksmithScripts } = await import("../fixer/apply");
      await applyLocksmithScripts(projectPath);
    },
  };
}
