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
  fixDockerfile: boolean;
  fixDocker: boolean;
  report?: "json" | "markdown";
  strict: boolean;
  outdated: boolean;
}

// ─── docker ──────────────────────────────────────────────────────────────────

export type DockerIssueKind = "pin-version" | "missing-flag" | "missing-copy" | "missing-cmd" | "update-from" | "advisory";

export type DockerSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface DockerIssue {
  line: number;
  kind: DockerIssueKind;
  description: string;
  original: string;
  replacement: string | null;
  severity?: DockerSeverity;
  remediationGuide?: string;
  source?: "internal" | "hadolint" | "trivy" | "docker-scout";
  cveId?: string;
  hadolintCode?: string;
}

export interface DockerfileAnalysis {
  found: boolean;
  dockerfilePath: string | null;
  issues: DockerIssue[];
  proposedContent: string | null;
}

export interface ScannerStatus {
  name: string;
  status: "ok" | "skipped" | "unavailable" | "error";
  issuesFound: number;
}

export interface QualityGateSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface DockerSecurityReport {
  found: boolean;
  dockerfilePath: string | null;
  issues: DockerIssue[];
  issueCount: number;
  hasFixableIssues: boolean;
  qualityGatePassed: boolean;
  qualityGateSummary: QualityGateSummary;
  internalChecksRan: boolean;
  scanners: ScannerStatus[];
  llmFixInstructions?: string;
}

// ─── safe-add ────────────────────────────────────────────────────────────────

export interface DangerousScript {
  scriptName: string;
  value: string;
  patterns: string[];
}

export interface SocketAlert {
  severity: "critical" | "high" | "middle" | "low";
  type: string;
}

export interface SocketScore {
  supplyChainRisk: number;
  alerts: SocketAlert[];
}

export interface PackageSecurityInfo {
  name: string;
  resolvedVersion: string;
  lifecycleScripts: Record<string, string>;
  dangerousScripts: DangerousScript[];
  socketScore?: SocketScore;
  riskLevel: "none" | "medium" | "critical";
}

export interface AddOptions {
  projectPath: string;
  package: string;
  version?: string;
  force: boolean;
  dryRun: boolean;
}

export class RegistryError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "timeout" | "network"
  ) {
    super(message);
    this.name = "RegistryError";
  }
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
