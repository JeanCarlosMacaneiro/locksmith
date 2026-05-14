import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

const REQUIRED_DELAYS: Record<string, number> = {
  patch: 3,
  minor: 7,
  major: 30,
};

function parseDays(value: string | undefined): number {
  if (!value) return 0;
  const match = value.match(/^(\d+)\s*(day|days)?$/);
  return match ? parseInt(match[1] ?? "0") : 0;
}

export async function checkRenovate(projectPath: string): Promise<CheckResult> {
  const paths = [
    join(projectPath, "renovate.json"),
    join(projectPath, "renovate.json5"),
    join(projectPath, ".github/renovate.json"),
  ];

  const found = paths.find(existsSync);

  if (!found) {
    return {
      name: "renovate.json",
      status: "warn",
      message: "renovate.json not found — release delay not configured",
      fixable: true,
      fix: async () => {
        const { applyRenovate } = await import("../fixer/apply");
        await applyRenovate(projectPath);
      },
      hint: [
        "Renovate is a bot that automatically opens PRs when new versions of your dependencies are available.",
        "Without this file, updates have no waiting period and may introduce malicious packages.",
        "",
        "Step 1 — Create the configuration file:",
        "  $ locksmith --fix",
        "",
        "Step 2 — Install Renovate on your repository (once per organization):",
        "  → GitHub:    https://github.com/apps/renovate",
        "  → GitLab:    https://docs.renovatebot.com/modules/platform/gitlab/",
        "  → Bitbucket: https://docs.renovatebot.com/modules/platform/bitbucket/",
        "",
        "Once installed, Renovate will read renovate.json and open PRs respecting",
        "the configured wait times (patch: 3d · minor: 7d · major: 30d).",
      ],
    };
  }

  const config = JSON.parse(readFileSync(found, "utf-8"));
  const rules: any[] = config.packageRules ?? [];
  const issues: string[] = [];

  for (const [type, minDays] of Object.entries(REQUIRED_DELAYS)) {
    const rule = rules.find((r) => r.matchUpdateTypes?.includes(type));

    if (!rule) {
      issues.push(`missing rule for '${type}'`);
      continue;
    }

    const days = parseDays(rule.minimumReleaseAge);
    if (days < minDays) {
      issues.push(`${type}: ${days}d (minimum ${minDays}d)`);
    }
  }

  if (issues.length > 0) {
    return {
      name: "renovate.json",
      status: "error",
      message: `Insufficient release delay → ${issues.join(" | ")}`,
      fixable: true,
      hint: [
        "'minimumReleaseAge' defines how many days Renovate must wait before opening a PR.",
        "This gives time to detect whether a new version is malicious before it enters your project.",
        "",
        "Required values by security policy:",
        "  patch  → minimum 3 days   (e.g. bug fix, low risk)",
        "  minor  → minimum 7 days   (e.g. new feature, medium risk)",
        "  major  → minimum 30 days  (e.g. breaking change, high risk)",
        "",
        "To fix automatically with the correct values:",
        "  $ locksmith --fix",
        "",
        "Or edit your renovate.json manually:",
        `  { "matchUpdateTypes": ["patch"], "minimumReleaseAge": "3 days", "automerge": false }`,
        `  { "matchUpdateTypes": ["minor"], "minimumReleaseAge": "7 days", "automerge": false }`,
        `  { "matchUpdateTypes": ["major"], "minimumReleaseAge": "30 days", "automerge": false }`,
      ],
    };
  }

  return {
    name: "renovate.json",
    status: "ok",
    message: "Release delay: patch 3d · minor 7d · major 30d",
    hint: [
      "Renovate will automatically open PRs when updates are available.",
      "Each PR will wait the configured time before it can be merged:",
      "  patch  → 3 days   → requires manual approval",
      "  minor  → 7 days   → requires manual approval",
      "  major  → 30 days  → requires manual approval",
      "",
      "To update a dependency manually without waiting for Renovate:",
      "  $ pnpm update <package>          → update to the latest allowed version",
      "  $ pnpm update <package> --latest → update ignoring version ranges",
      "  $ pnpm add <package>@<version>   → install a specific version",
    ],
  };
}
