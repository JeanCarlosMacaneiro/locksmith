import { $ } from "bun";
import type { CheckResult, ProjectType } from "../types";

type VulnCounts = { critical: number; high: number; moderate: number; low: number };

function parsePnpmNpm(json: string): VulnCounts {
  const data = JSON.parse(json || "{}") as Record<string, unknown>;
  const v = (data.metadata as Record<string, unknown>)?.vulnerabilities as Record<string, number> ?? {};
  return { critical: v.critical ?? 0, high: v.high ?? 0, moderate: v.moderate ?? 0, low: v.low ?? 0 };
}

function parseYarn(output: string): VulnCounts {
  for (const line of output.trim().split("\n").reverse()) {
    try {
      const obj = JSON.parse(line) as { type: string; data: { vulnerabilities: Record<string, number> } };
      if (obj.type === "auditSummary") {
        const v = obj.data.vulnerabilities;
        return { critical: v.critical ?? 0, high: v.high ?? 0, moderate: v.moderate ?? 0, low: v.low ?? 0 };
      }
    } catch { continue; }
  }
  return { critical: 0, high: 0, moderate: 0, low: 0 };
}

function toResult(name: string, v: VulnCounts, projectPath: string): CheckResult {
  const total = v.critical + v.high + v.moderate + v.low;
  if (total === 0) return { name, status: "ok", message: "No known vulnerabilities" };

  const pm = name.split(" ")[0]!; // "pnpm" | "npm" | "yarn"

  const fixFn = async () => {
    const fixCmd = pm === "yarn"
      ? $`yarn audit --fix`.cwd(projectPath)
      : pm === "npm"
        ? $`npm audit fix`.cwd(projectPath)
        : $`pnpm audit --fix`.cwd(projectPath);
    await fixCmd.quiet().catch(() => { /* partial fix is ok — re-run will show remaining */ });
  };

  if (v.critical > 0 || v.high > 0) {
    return {
      name,
      status: "error",
      message: `${v.critical} critical · ${v.high} high · ${v.moderate} moderate · ${v.low} low`,
      fixable: true,
      fix: fixFn,
      hint: [
        `Run \`locksmith . --fix\` to auto-upgrade vulnerable packages via \`${pm} audit --fix\``,
        `Run \`locksmith . --fix --outdated\` to also update outdated packages in the same pass`,
        "If auto-fix leaves remaining issues, update or replace each affected package manually:",
        `  → ${pm} update <package>`,
        "  → Check for a patched version and pin it in package.json",
        "  → For critical packages with no fix, consider removing the dependency",
        `  → Full details: ${pm} audit`,
      ],
    };
  }
  return {
    name,
    status: "warn",
    message: `${v.moderate} moderate · ${v.low} low`,
    fixable: true,
    fix: fixFn,
    hint: [
      `Run \`locksmith . --fix\` to apply available patches via \`${pm} audit --fix\``,
      `Run \`locksmith . --fix --outdated\` to also update outdated packages in the same pass`,
      `  → Full details: ${pm} audit`,
    ],
  };
}

export async function checkAudit(projectPath: string, type: ProjectType = "node"): Promise<CheckResult> {
  try {
    if (type === "yarn") {
      const output = await $`yarn audit --json`.cwd(projectPath).text().catch((e: { stdout?: string }) => e.stdout ?? "");
      return toResult("yarn audit", parseYarn(output), projectPath);
    }

    if (type === "npm") {
      const output = await $`npm audit --json`.cwd(projectPath).text().catch((e: { stdout?: string }) => e.stdout ?? "{}");
      return toResult("npm audit", parsePnpmNpm(output), projectPath);
    }

    // pnpm — default for node, bun, electron
    const output = await $`pnpm audit --json`.cwd(projectPath).text().catch((e: { stdout?: string }) => e.stdout ?? "{}");
    return toResult("pnpm audit", parsePnpmNpm(output), projectPath);
  } catch {
    const pm = type === "yarn" ? "yarn" : type === "npm" ? "npm" : "pnpm";
    return { name: `${pm} audit`, status: "warn", message: `Could not run ${pm} audit (lockfile present?)` };
  }
}
