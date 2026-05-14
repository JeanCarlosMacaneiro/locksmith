import { $ } from "bun";
import type { CheckResult } from "../../types";

export async function checkPoetryAudit(projectPath: string): Promise<CheckResult> {
  try {
    const result = await $`poetry audit --json`
      .cwd(projectPath)
      .text()
      .catch((e) => e.stdout ?? "{}");

    const data = JSON.parse(result || "{}");
    const vulnerabilities: any[] = data.vulnerabilities ?? [];

    if (vulnerabilities.length === 0) {
      return {
        name: "poetry audit",
        status: "ok",
        message: "No known vulnerabilities",
      };
    }

    const critical = vulnerabilities.filter((v) => v.severity === "critical").length;
    const high     = vulnerabilities.filter((v) => v.severity === "high").length;
    const moderate = vulnerabilities.filter((v) => v.severity === "moderate").length;
    const low      = vulnerabilities.filter((v) => v.severity === "low").length;

    if (critical > 0 || high > 0) {
      return {
        name: "poetry audit",
        status: "error",
        message: `${critical} critical · ${high} high · ${moderate} moderate · ${low} low`,
      };
    }

    return {
      name: "poetry audit",
      status: "warn",
      message: `${moderate} moderate · ${low} low`,
    };
  } catch {
    return {
      name: "poetry audit",
      status: "warn",
      message: "Could not run poetry audit (poetry.lock present?)",
    };
  }
}
