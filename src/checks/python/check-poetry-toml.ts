import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../../types";

export async function checkPoetryToml(projectPath: string): Promise<CheckResult> {
  const tomlPath = join(projectPath, "poetry.toml");

  if (!existsSync(tomlPath)) {
    return {
      name: "poetry.toml",
      status: "warn",
      message: "poetry.toml no encontrado — virtualenv creado fuera del proyecto",
      fixable: true,
      fix: async () => {
        const { applyPoetryToml } = await import("../../fixer/apply");
        await applyPoetryToml(projectPath);
      },
    };
  }

  const content = readFileSync(tomlPath, "utf-8");

  if (!content.includes("in-project") || !content.includes("true")) {
    return {
      name: "poetry.toml",
      status: "warn",
      message: "virtualenvs.in-project no está habilitado",
      fixable: true,
      fix: async () => {
        const { applyPoetryToml } = await import("../../fixer/apply");
        await applyPoetryToml(projectPath);
      },
    };
  }

  return {
    name: "poetry.toml",
    status: "ok",
    message: "virtualenvs.in-project: true",
  };
}
