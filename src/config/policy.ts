import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export const POLICY_DEFAULTS = { patch: 3, minor: 7, major: 30 } as const;

type PolicyOverride = Partial<{ patch: number; minor: number; major: number }>;

interface LocksmithConfig {
  outdatedPolicy?: PolicyOverride;
}

function configPath(projectPath: string): string {
  return join(projectPath, ".locksmith.json");
}

export function readLocksmithPolicy(projectPath: string): PolicyOverride {
  const path = configPath(projectPath);
  if (!existsSync(path)) return {};
  try {
    const cfg: LocksmithConfig = JSON.parse(readFileSync(path, "utf-8"));
    return cfg.outdatedPolicy ?? {};
  } catch {
    return {};
  }
}

export function writeLocksmithPolicy(projectPath: string, updates: PolicyOverride): void {
  const path = configPath(projectPath);
  let existing: LocksmithConfig = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      existing = {};
    }
  }
  existing.outdatedPolicy = { ...existing.outdatedPolicy, ...updates };
  writeFileSync(path, JSON.stringify(existing, null, 2) + "\n");
}
