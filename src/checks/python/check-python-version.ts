import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../../types";

const REQUIRED_VERSION = "3.12.7";
const REQUIRED_MINOR   = 3.12;

export async function checkPythonVersion(projectPath: string): Promise<CheckResult> {
  const versionPath = join(projectPath, ".python-version");

  if (!existsSync(versionPath)) {
    return {
      name: "python version",
      status: "warn",
      message: `Campo .python-version ausente — versión de Python no fijada (recomendado: ${REQUIRED_VERSION})`,
      fixable: true,
      fix: async () => {
        const { applyPythonVersion } = await import("../../fixer/apply");
        await applyPythonVersion(projectPath);
      },
    };
  }

  const version = readFileSync(versionPath, "utf-8").trim();
  const minor   = parseFloat(version.split(".").slice(0, 2).join("."));

  if (minor < REQUIRED_MINOR) {
    return {
      name: "python version",
      status: "error",
      message: `Python ${version} fijado — se requiere >= ${REQUIRED_MINOR}`,
      fixable: true,
      fix: async () => {
        const { applyPythonVersion } = await import("../../fixer/apply");
        await applyPythonVersion(projectPath);
      },
    };
  }

  return {
    name: "python version",
    status: "ok",
    message: `Versión fijada: ${version}`,
  };
}
