import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname, relative } from "path";
import type { CheckResult } from "../types";

// ─── patterns ─────────────────────────────────────────────────────────────────

interface SecretPattern {
  name: string;
  regex: RegExp;
  severity: "error" | "warn";
}

const PATTERNS: SecretPattern[] = [
  {
    name: "PEM private key",
    regex: /-----BEGIN\s+(?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: "error",
  },
  {
    name: "AWS access key",
    regex: /AKIA[0-9A-Z]{16}/,
    severity: "error",
  },
  {
    name: "GitHub token",
    regex: /gh[pousr]_[A-Za-z0-9_]{36,}/,
    severity: "error",
  },
  {
    name: "Stripe live key",
    regex: /sk_live_[a-zA-Z0-9]{24,}/,
    severity: "error",
  },
  {
    name: "hardcoded secret",
    // Matches: password = "actualValue" but avoids placeholders, env refs, test values
    regex: /(?:password|passwd|secret|api[_-]?key|auth[_-]?token)\s*[:=]\s*["'](?![^"']*(?:your[_-]|example|test|demo|placeholder|<|\$\{|process\.env))[^"']{12,}["']/i,
    severity: "warn",
  },
];

// ─── file walker ──────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".venv", "venv", "dist", "build",
  "__pycache__", ".next", ".nuxt", "coverage", ".nyc_output",
  ".turbo", "out", ".cache",
]);

const SCAN_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".sh", ".bash", ".zsh",
  ".yaml", ".yml", ".toml", ".json",
  ".tf", ".hcl",
]);

const MAX_FILE_SIZE = 512 * 1024; // 512 KB

function* walkFiles(dir: string, depth = 0): Generator<string> {
  if (depth > 6) return;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walkFiles(fullPath, depth + 1);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (SCAN_EXTENSIONS.has(ext)) {
        try {
          if (statSync(fullPath).size <= MAX_FILE_SIZE) yield fullPath;
        } catch { /* skip */ }
      }
    }
  }
}

// ─── check ────────────────────────────────────────────────────────────────────

interface Finding {
  file: string;
  line: number;
  patternName: string;
  severity: "error" | "warn";
}

export async function checkSecrets(projectPath: string): Promise<CheckResult> {
  const findings: Finding[] = [];

  for (const filePath of walkFiles(projectPath)) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const pattern of PATTERNS) {
        if (pattern.regex.test(line)) {
          findings.push({
            file: relative(projectPath, filePath),
            line: i + 1,
            patternName: pattern.name,
            severity: pattern.severity,
          });
          break; // one finding per line is enough
        }
      }
    }
  }

  if (findings.length === 0) {
    return {
      name: "secrets scan",
      status: "ok",
      message: "No secrets detected in source code",
    };
  }

  const hasErrors = findings.some((f) => f.severity === "error");
  const count = findings.length;

  // Build location table for hint
  const locationLines = findings.map((f) => {
    const fileCol = f.file.padEnd(40);
    const lineCol = `line ${f.line}`.padEnd(12);
    return `  ${fileCol}  ${lineCol}  ${f.patternName}`;
  });

  return {
    name: "secrets scan",
    status: hasErrors ? "error" : "warn",
    message: `${count} possible secret${count !== 1 ? "s" : ""} detected`,
    fixable: false,
    hint: [
      "Hardcoded secrets found:",
      "",
      ...locationLines,
      "",
      "Secrets must not exist in the repository — use environment variables.",
      "",
      "Recommended steps:",
      "  1. Immediately revoke/rotate any exposed credentials",
      "  2. Move values to environment variables (.env)",
      "  3. Make sure .env is in .gitignore",
      "  4. Clean git history if the secret was already committed:",
      "     → https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository",
    ],
  };
}
