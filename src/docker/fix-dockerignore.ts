import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export const SENSITIVE_PATTERNS: readonly string[] = [
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.crt",
  "*.cer",
  "id_rsa",
  "id_ed25519",
  "*.ppk",
  ".env",
  ".env.*",
  "*.env",
  ".env.local",
  ".env.production",
  ".env.development",
  "secrets/",
  "credentials*",
  ".aws/",
  ".ssh/",
  "*.secret",
  ".git",
  "node_modules",
  "dist/",
  "build/",
  ".DS_Store",
  "docker-compose.override.yml",
  "*.tfvars",
  "terraform.tfstate",
];

export function generateBaseDockerignore(): string {
  return `${SENSITIVE_PATTERNS.join("\n")}\n`;
}

function normalizeDockerignoreLine(line: string): string {
  return line.trim();
}

function dockerignoreHasPattern(content: string, pattern: string): boolean {
  const target = normalizeDockerignoreLine(pattern);
  return content
    .split(/\r?\n/)
    .map(normalizeDockerignoreLine)
    .some((l) => l !== "" && !l.startsWith("#") && l === target);
}

export function applyDockerignoreFix(projectPath: string, missingPatterns: string[]): void {
  const dockerignorePath = join(projectPath, ".dockerignore");

  if (!existsSync(dockerignorePath)) {
    writeFileSync(dockerignorePath, generateBaseDockerignore(), "utf-8");
    return;
  }

  const existing = readFileSync(dockerignorePath, "utf-8");
  const toAppend = missingPatterns.filter((p) => !dockerignoreHasPattern(existing, p));
  if (toAppend.length === 0) return;

  const suffix = existing.endsWith("\n") ? "" : "\n";
  writeFileSync(dockerignorePath, `${existing}${suffix}${toAppend.join("\n")}\n`, "utf-8");
}
