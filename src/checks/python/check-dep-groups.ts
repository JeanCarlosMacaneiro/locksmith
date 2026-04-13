import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../../types";

// Packages that should never be in production dependencies
const DEV_ONLY_PACKAGES = [
  "pytest", "pytest-cov", "pytest-asyncio",
  "black", "ruff", "flake8", "pylint",
  "mypy", "pyright",
  "isort", "autopep8",
  "hypothesis", "faker",
  "coverage",
];

export async function checkDepGroups(projectPath: string): Promise<CheckResult> {
  const pyprojectPath = join(projectPath, "pyproject.toml");

  if (!existsSync(pyprojectPath)) {
    return { name: "dependency groups", status: "warn", message: "pyproject.toml no encontrado" };
  }

  const content = readFileSync(pyprojectPath, "utf-8");

  // Check if dev group exists
  const hasDevGroup = content.includes("[tool.poetry.group.dev.dependencies]") ||
                      content.includes("[tool.poetry.dev-dependencies]");

  if (!hasDevGroup) {
    return {
      name: "dependency groups",
      status: "warn",
      message: "Sin grupo dev — dependencias de desarrollo mezcladas con producción",
      fixable: true,
      fix: async () => {
        const { applyDepGroups } = await import("../../fixer/apply");
        await applyDepGroups(projectPath);
      },
    };
  }

  // Check if dev-only packages are in production dependencies
  const prodSection = content.split(/\[tool\.poetry\.group\.|tool\.poetry\.dev/)[0] ?? "";
  const misplacedPkgs = DEV_ONLY_PACKAGES.filter((pkg) =>
    new RegExp(`^${pkg}\\s*=`, "m").test(prodSection)
  );

  if (misplacedPkgs.length > 0) {
    return {
      name: "dependency groups",
      status: "warn",
      message: `Paquetes dev en producción: ${misplacedPkgs.join(", ")}`,
      fixable: true,
      fix: async () => {
        const { applyDepGroups } = await import("../../fixer/apply");
        await applyDepGroups(projectPath);
      },
    };
  }

  // Count packages in each group
  const devMatch  = content.match(/\[tool\.poetry\.group\.dev\.dependencies\]([\s\S]*?)(?=\[|$)/);
  const prodMatch = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\[|$)/);

  const countPkgs = (section: string) =>
    (section.match(/^\s*\w[\w-]*\s*=/gm) ?? []).length;

  const devCount  = devMatch  ? countPkgs(devMatch[1]  ?? "") : 0;
  const prodCount = prodMatch ? countPkgs(prodMatch[1] ?? "") - 1 : 0; // -1 for python itself

  return {
    name: "dependency groups",
    status: "ok",
    message: `dev: ${devCount} paquetes · prod: ${prodCount} paquetes`,
  };
}
