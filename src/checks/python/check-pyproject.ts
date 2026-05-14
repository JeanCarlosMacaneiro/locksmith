import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../../types";

const REQUIRED_PYTHON = ">=3.12";

export async function checkPyproject(projectPath: string): Promise<CheckResult> {
  const pyprojectPath = join(projectPath, "pyproject.toml");

  if (!existsSync(pyprojectPath)) {
    return {
      name: "pyproject.toml",
      status: "error",
      message: "pyproject.toml not found — Poetry project not initialized",
      fixable: true,
      fix: async () => {
        const { applyPyproject } = await import("../../fixer/apply");
        await applyPyproject(projectPath);
      },
    };
  }

  const content = readFileSync(pyprojectPath, "utf-8");
  const issues: string[] = [];

  // Validate that [tool.poetry] section exists
  if (!content.includes("[tool.poetry]")) {
    issues.push("missing section [tool.poetry]");
  }

  // Validate requires-python >= 3.12
  const pythonMatch = content.match(/python\s*=\s*"([^"]+)"/);
  if (!pythonMatch) {
    issues.push(`missing requires-python = "${REQUIRED_PYTHON}"`);
  } else {
    const spec = pythonMatch[1] ?? "";
    const versionMatch = spec.match(/(\d+\.\d+)/);
    const version = versionMatch ? parseFloat(versionMatch[1]!) : 0;
    if (version < 3.12) {
      issues.push(`python = "${spec}" — ${REQUIRED_PYTHON} required`);
    }
  }

  if (issues.length > 0) {
    return {
      name: "pyproject.toml",
      status: "error",
      message: `Invalid configuration → ${issues.join(" | ")}`,
      fixable: true,
      fix: async () => {
        const { applyPyproject } = await import("../../fixer/apply");
        await applyPyproject(projectPath);
      },
    };
  }

  return {
    name: "pyproject.toml",
    status: "ok",
    message: `requires-python: ${REQUIRED_PYTHON}`,
  };
}
