import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { OutdatedPackage, RenovatePolicy, UpdateType } from "../types";
import { readLocksmithPolicy } from "../config/policy";

// ─── semver helpers ───────────────────────────────────────────────────────────

export function classifyUpdateType(current: string, latest: string): UpdateType {
  const parse = (v: string) =>
    v.replace(/[^0-9.]/g, "").split(".").map((n) => parseInt(n) || 0);

  const [curMaj = 0, curMin = 0] = parse(current);
  const [latMaj = 0, latMin = 0] = parse(latest);

  if (latMaj > curMaj) return "major";
  if (latMin > curMin) return "minor";
  return "patch";
}

export function calcAgeInDays(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function isPolicyMet(
  ageInDays: number | null,
  policyDays: number
): boolean | null {
  if (ageInDays === null) return null;
  return ageInDays >= policyDays;
}

// ─── renovate policy reader ───────────────────────────────────────────────────

export function readRenovatePolicy(projectPath: string): RenovatePolicy {
  const paths = [
    join(projectPath, "renovate.json"),
    join(projectPath, "renovate.json5"),
    join(projectPath, ".github/renovate.json"),
  ];

  const defaults: RenovatePolicy = { patch: 3, minor: 7, major: 30, hasConfig: false };
  const found = paths.find(existsSync);
  if (!found) return applyLocksmithOverrides({ ...defaults }, projectPath);

  try {
    const config = JSON.parse(readFileSync(found, "utf-8"));
    const rules: any[] = config.packageRules ?? [];
    const policy: RenovatePolicy = { patch: 3, minor: 7, major: 30, hasConfig: true };

    for (const rule of rules) {
      for (const type of ["patch", "minor", "major"] as const) {
        if (rule.matchUpdateTypes?.includes(type) && rule.minimumReleaseAge) {
          const match = String(rule.minimumReleaseAge).match(/^(\d+)/);
          if (match) policy[type] = parseInt(match[1]!);
        }
      }
    }

    return applyLocksmithOverrides(policy, projectPath);
  } catch {
    return applyLocksmithOverrides(defaults, projectPath);
  }
}

function applyLocksmithOverrides(base: RenovatePolicy, projectPath: string): RenovatePolicy {
  const overrides = readLocksmithPolicy(projectPath);
  if (overrides.patch !== undefined) base.patch = overrides.patch;
  if (overrides.minor !== undefined) base.minor = overrides.minor;
  if (overrides.major !== undefined) base.major = overrides.major;
  return base;
}

// ─── package builder ──────────────────────────────────────────────────────────

export function buildOutdatedPackage(
  name: string,
  current: string,
  latest: string,
  publishedAt: Date | null,
  policy: RenovatePolicy
): OutdatedPackage {
  const updateType = classifyUpdateType(current, latest);
  const ageInDays  = publishedAt ? calcAgeInDays(publishedAt) : null;
  const policyDays = policy[updateType];
  const policyMet  = isPolicyMet(ageInDays, policyDays);
  const safeToUpdate = updateType === "patch" && policyMet === true;

  return { name, current, latest, updateType, ageInDays, policyDays, policyMet, safeToUpdate };
}
