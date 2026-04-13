import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../../types";

const OFFICIAL_PYPI = "https://pypi.org/simple/";

export async function checkPypiSource(projectPath: string): Promise<CheckResult> {
  const pyprojectPath = join(projectPath, "pyproject.toml");

  if (!existsSync(pyprojectPath)) {
    return { name: "PyPI registry", status: "warn", message: "pyproject.toml no encontrado" };
  }

  const content = readFileSync(pyprojectPath, "utf-8");

  // Extract [[tool.poetry.source]] sections
  const sourceMatches = [...content.matchAll(/\[\[tool\.poetry\.source\]\]([\s\S]*?)(?=\[\[|$)/g)];

  if (sourceMatches.length === 0) {
    return {
      name: "PyPI registry",
      status: "ok",
      message: `Usando PyPI oficial: ${OFFICIAL_PYPI}`,
    };
  }

  const untrustedSources: string[] = [];

  for (const match of sourceMatches) {
    const block = match[1] ?? "";
    const urlMatch  = block.match(/url\s*=\s*"([^"]+)"/);
    const nameMatch = block.match(/name\s*=\s*"([^"]+)"/);
    const url  = urlMatch?.[1]  ?? "";
    const name = nameMatch?.[1] ?? "unknown";

    if (url && !url.startsWith("https://pypi.org")) {
      untrustedSources.push(`${name} (${url})`);
    }
  }

  if (untrustedSources.length > 0) {
    return {
      name: "PyPI registry",
      status: "error",
      message: `Sources no oficiales detectados: ${untrustedSources.join(", ")}`,
      fixable: true,
      fix: async () => {
        const { applyPypiSource } = await import("../../fixer/apply");
        await applyPypiSource(projectPath);
      },
    };
  }

  return {
    name: "PyPI registry",
    status: "ok",
    message: `Usando PyPI oficial: ${OFFICIAL_PYPI}`,
  };
}
