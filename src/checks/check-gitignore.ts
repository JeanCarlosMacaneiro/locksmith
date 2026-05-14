import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { CheckResult } from "../types";

// ─── required patterns ────────────────────────────────────────────────────────

interface RequiredPattern {
  label: string;
  // Multiple matchers — any one of them satisfies the requirement
  matchers: RegExp[];
}

const REQUIRED_PATTERNS: RequiredPattern[] = [
  {
    label: ".env",
    matchers: [/^\.env$/m, /^\.env\*/m, /^\.env\.\*/m],
  },
  {
    label: "*.pem",
    matchers: [/^\*\.pem$/m, /^# \*\.pem/m],
  },
  {
    label: "*.key",
    matchers: [/^\*\.key$/m],
  },
];

// ─── check ────────────────────────────────────────────────────────────────────

export async function checkGitignore(projectPath: string): Promise<CheckResult> {
  const gitignorePath = join(projectPath, ".gitignore");

  if (!existsSync(gitignorePath)) {
    return {
      name: ".gitignore",
      status: "error",
      message: ".gitignore not found — sensitive files could be committed",
      fixable: true,
      fix: async () => {
        const { applyGitignore } = await import("../fixer/apply");
        await applyGitignore(projectPath);
      },
    };
  }

  const content = readFileSync(gitignorePath, "utf-8");
  const missing  = REQUIRED_PATTERNS
    .filter((p) => !p.matchers.some((m) => m.test(content)))
    .map((p) => p.label);

  if (missing.length > 0) {
    return {
      name: ".gitignore",
      status: "warn",
      message: `Sensitive patterns not ignored: ${missing.join(", ")}`,
      fixable: true,
      fix: async () => {
        const { applyGitignore } = await import("../fixer/apply");
        await applyGitignore(projectPath);
      },
    };
  }

  return {
    name: ".gitignore",
    status: "ok",
    message: `Sensitive patterns covered: ${REQUIRED_PATTERNS.map((p) => p.label).join(", ")}`,
  };
}
