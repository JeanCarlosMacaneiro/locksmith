export interface CheckResult {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  fixable?: boolean;
  fix?: () => Promise<void>;
  hint?: string[];
  wasFixed?: boolean;
}

export interface ProjectInfo {
  valid: boolean;
  type: "node" | "bun" | "python" | "unknown";
  name: string;
  version: string;
  hasBunLockb: boolean;
  hasPackageJson: boolean;
  hasPyproject: boolean;
}

export interface RunOptions {
  projectPath: string;
  fix: boolean;
  report?: "json" | "markdown";
  strict: boolean;
  outdated: boolean;
}

// ─── outdated ────────────────────────────────────────────────────────────────

export type UpdateType = "patch" | "minor" | "major";

export interface RenovatePolicy {
  patch: number;
  minor: number;
  major: number;
  hasConfig: boolean;
}

export interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  updateType: UpdateType;
  ageInDays: number | null;
  policyDays: number;
  policyMet: boolean | null;
  safeToUpdate: boolean;
}
