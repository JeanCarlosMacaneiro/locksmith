import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

const REQUIRED_RULES: Record<string, string> = {
  "ignore-scripts": "true",
  "verify-store-integrity": "true",
  "strict-ssl": "true",
  "frozen-lockfile": "true",
  "node-linker": "isolated",
};

export async function checkNpmrc(projectPath: string): Promise<CheckResult> {
  const npmrcPath = join(projectPath, ".npmrc");

  if (!existsSync(npmrcPath)) {
    return {
      name: ".npmrc",
      status: "error",
      message: ".npmrc no encontrado — configuración de seguridad ausente",
      fixable: true,
      fix: async () => {
        const { applyNpmrc } = await import("../fixer/apply");
        await applyNpmrc(projectPath);
      },
    };
  }

  const content = readFileSync(npmrcPath, "utf-8");
  const missing: string[] = [];

  for (const [key, val] of Object.entries(REQUIRED_RULES)) {
    const regex = new RegExp(`^\\s*${key}\\s*=\\s*${val}`, "m");
    if (!regex.test(content)) missing.push(`${key}=${val}`);
  }

  if (missing.length > 0) {
    return {
      name: ".npmrc",
      status: "error",
      message: `Faltan reglas: ${missing.join(", ")}`,
      fixable: true,
      fix: async () => {
        const { applyNpmrc } = await import("../fixer/apply");
        await applyNpmrc(projectPath);
      },
    };
  }

  return {
    name: ".npmrc",
    status: "ok",
    message: `${Object.keys(REQUIRED_RULES).length}/${Object.keys(REQUIRED_RULES).length} reglas activas`,
  };
}
