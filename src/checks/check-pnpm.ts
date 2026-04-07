import { $ } from "bun";
import type { CheckResult } from "../types";

const MIN_VERSION = 8;

export async function checkPnpm(_projectPath: string): Promise<CheckResult> {
  try {
    const result = await $`pnpm --version`.text();
    const version = result.trim();
    const major = parseInt(version.split(".")[0] ?? "0");

    if (major < MIN_VERSION) {
      return {
        name: "pnpm version",
        status: "warn",
        message: `pnpm ${version} instalado — se recomienda v${MIN_VERSION}+`,
      };
    }

    return {
      name: "pnpm version",
      status: "ok",
      message: `pnpm ${version} instalado`,
    };
  } catch {
    return {
      name: "pnpm version",
      status: "error",
      message: "pnpm no está instalado — ejecuta: npm install -g pnpm",
      fixable: false,
    };
  }
}
