import { $ } from "bun";
import type { CheckResult } from "../types";

export async function checkAudit(projectPath: string): Promise<CheckResult> {
  try {
    const result = await $`pnpm audit --json`.cwd(projectPath).text().catch((e) => e.stdout ?? "{}");
    const data = JSON.parse(result || "{}");

    const metadata = data.metadata ?? {};
    const vulnerabilities = metadata.vulnerabilities ?? {};

    const critical = vulnerabilities.critical ?? 0;
    const high = vulnerabilities.high ?? 0;
    const moderate = vulnerabilities.moderate ?? 0;
    const low = vulnerabilities.low ?? 0;
    const total = critical + high + moderate + low;

    if (total === 0) {
      return {
        name: "pnpm audit",
        status: "ok",
        message: "Sin vulnerabilidades conocidas",
      };
    }

    if (critical > 0 || high > 0) {
      return {
        name: "pnpm audit",
        status: "error",
        message: `${critical} críticas · ${high} altas · ${moderate} moderadas · ${low} bajas`,
      };
    }

    return {
      name: "pnpm audit",
      status: "warn",
      message: `${moderate} moderadas · ${low} bajas`,
    };
  } catch {
    return {
      name: "pnpm audit",
      status: "warn",
      message: "No se pudo ejecutar pnpm audit (¿lockfile presente?)",
    };
  }
}
