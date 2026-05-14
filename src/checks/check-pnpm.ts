import { $ } from "bun";
import type { CheckResult } from "../types";

const MIN_VERSION = 11;

export async function checkPnpm(_projectPath: string): Promise<CheckResult> {
  try {
    const result = await $`pnpm --version`.text();
    const version = result.trim();
    const major = parseInt(version.split(".")[0] ?? "0");

    if (major < MIN_VERSION) {
      return {
        name: "pnpm version",
        status: "warn",
        message: `pnpm ${version} installed — v${MIN_VERSION}+ recommended`,
      };
    }

    return {
      name: "pnpm version",
      status: "ok",
      message: `pnpm ${version} installed`,
    };
  } catch {
    return {
      name: "pnpm version",
      status: "error",
      message: "pnpm not installed — run: corepack enable && corepack install -g pnpm@latest",
      fixable: false,
    };
  }
}
