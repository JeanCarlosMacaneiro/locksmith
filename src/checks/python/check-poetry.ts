import { $ } from "bun";
import type { CheckResult } from "../../types";

const MIN_VERSION = 1.8;

export async function checkPoetry(_projectPath: string): Promise<CheckResult> {
  try {
    const result = await $`poetry --version`.text();
    const match  = result.match(/(\d+\.\d+\.\d+)/);
    const version = match?.[1] ?? "0.0.0";
    const major   = parseFloat(version.split(".").slice(0, 2).join("."));

    if (major < MIN_VERSION) {
      return {
        name: "poetry version",
        status: "warn",
        message: `Poetry ${version} instalado — se recomienda v${MIN_VERSION}+`,
      };
    }

    return {
      name: "poetry version",
      status: "ok",
      message: `Poetry ${version} instalado`,
    };
  } catch {
    return {
      name: "poetry version",
      status: "error",
      message: "Poetry no está instalado — instálalo desde: https://python-poetry.org/docs/#installation",
      fixable: false,
    };
  }
}
