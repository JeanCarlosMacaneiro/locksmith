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
  type: "node" | "bun" | "unknown";
  name: string;
  version: string;
  hasBunLockb: boolean;
  hasPackageJson: boolean;
}

export interface RunOptions {
  projectPath: string;
  fix: boolean;
  report?: "json" | "markdown";
  strict: boolean;
}
