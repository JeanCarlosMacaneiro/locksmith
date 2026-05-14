import type { DangerousScript } from "../types";

export const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall"] as const;

export const DANGEROUS_PATTERNS = [
  "curl", "wget", "bash", "sh", "eval", "exec", "node -e", "python -c",
] as const;

// Strips trivial obfuscation before pattern matching:
// cu\rl → curl, ba"sh" → bash, 'sh' → sh
export function normalizeScript(value: string): string {
  return value
    .replace(/\\([a-zA-Z])/g, "$1")
    .replace(/"([^"\s]*)"/g, "$1")
    .replace(/'([^'\s]*)'/g, "$1")
    .toLowerCase();
}

export function inspectScripts(packageJson: Record<string, unknown>): DangerousScript[] {
  const scripts = packageJson.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return [];

  const result: DangerousScript[] = [];

  for (const name of LIFECYCLE_SCRIPTS) {
    const value = (scripts as Record<string, unknown>)[name];
    if (typeof value !== "string") continue;

    const normalized = normalizeScript(value);
    const found = DANGEROUS_PATTERNS.filter((p) => normalized.includes(p));
    if (found.length > 0) {
      result.push({ scriptName: name, value, patterns: found as unknown as string[] });
    }
  }

  return result;
}
