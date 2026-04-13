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
        message: "Sin vulnerabilidades conocidas",
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
        message: `${critical} críticas · ${high} altas · ${moderate} moderadas · ${low} bajas`,
      };
    }

    return {
      name: "poetry audit",
      status: "warn",
      message: `${moderate} moderadas · ${low} bajas`,
    };
  } catch {
    return {
      name: "poetry audit",
      status: "warn",
      message: "No se pudo ejecutar poetry audit (¿poetry.lock presente?)",
    };
  }
}
