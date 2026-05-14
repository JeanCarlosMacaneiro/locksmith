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
        message: `Poetry ${version} installed — v${MIN_VERSION}+ recommended`,
      };
    }

    return {
      name: "poetry version",
      status: "ok",
      message: `Poetry ${version} installed`,
    };
  } catch {
    return {
      name: "poetry version",
      status: "error",
      message: "Poetry not installed — install from: https://python-poetry.org/docs/#installation",
      fixable: false,
    };
  }
}
