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
        message: `pnpm ${version} installed — v${MIN_VERSION}+ required`,
        fixable: true,
        fix: async () => {
          await $`corepack enable`.quiet();
          await $`corepack install -g pnpm@latest`.quiet();
        },
        hint: [
          `pnpm v${version} → upgrade to v${MIN_VERSION}+ required for full security policy support`,
          "Fix will run: corepack enable && corepack install -g pnpm@latest",
          "After upgrade, migrate your project store:",
          "  → pnpm install",
          "  → Then re-run: locksmith . --fix --outdated",
        ],
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
