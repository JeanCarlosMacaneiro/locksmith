import type {
  CheckResult,
  DockerIssue,
  OutdatedPackage,
  DangerousScript,
  SocketScore,
  QualityGateSummary,
} from "../types";

// ─── Tool definition ──────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

// ─── Serialized CheckResult (fix function stripped) ───────────────────────────

export interface SerializedCheckResult {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  fixable?: boolean;
  fix: null; // always null — functions are not JSON-serializable
  hint?: string[];
  wasFixed?: boolean;
}

// ─── locksmith_audit / locksmith_fix output ───────────────────────────────────

export interface AuditOutput {
  projectType: string;
  projectName: string;
  summary: { ok: number; warn: number; error: number };
  checks: SerializedCheckResult[];
  hasErrors: boolean;
  hasWarnings: boolean;
  fixableCount: number;
}

export interface FixOutput extends AuditOutput {
  fixedChecks: string[]; // names of checks that went from error/warn → ok
}

// ─── locksmith_audit_dockerfile output ───────────────────────────────────────

export interface DockerAuditOutput {
  found: boolean;
  dockerfilePath: string | null;
  issues: DockerIssue[];
  issueCount: number;
  hasFixableIssues: boolean;
  qualityGatePassed?: boolean;
  qualityGateSummary?: QualityGateSummary;
}

// ─── locksmith_fix_dockerfile output ─────────────────────────────────────────

export interface BuildFailure {
  exitCode: number;
  stderr: string;
  appliedFixes: DockerIssue[];
  originalContent: string;
  fixedContent: string;
}

export interface LLMContext {
  diff: string;
  buildError: string;
  probableCause: string;
  suggestedApproach: string;
  userMessage: string;
}

export interface NextStep {
  tool: "locksmith_fix_docker";
  requiredParams: {
    projectPath: string;
    verifyBuild: true;
    buildFixProposal: string;
  };
}

export interface DockerFixOutput {
  fixed: boolean;
  issuesFixed: number;
  dockerfilePath: string | null;
  buildVerified?: boolean;
  buildSkipped?: boolean;
  buildFixed?: boolean;
  buildFailure?: BuildFailure;
  llmContext?: LLMContext;
  iterationCount?: number;
  remainingIterations?: number;
  nextStep?: NextStep;
  maxIterationsReached?: boolean;
}

// ─── locksmith_check_outdated output ─────────────────────────────────────────

export interface OutdatedOutput {
  packages: OutdatedPackage[];
  totalOutdated: number;
  safeToUpdate: number;
  policyMet: number;
  warning?: string;
}

// ─── locksmith_safe_add output ────────────────────────────────────────────────

export interface SafeAddOutput {
  name: string;
  resolvedVersion: string;
  riskLevel: "none" | "medium" | "critical";
  dangerousScripts: DangerousScript[];
  socketScore: SocketScore | null;
  installed: boolean;
}

// ─── Error output ─────────────────────────────────────────────────────────────

export interface McpErrorOutput {
  error: "PROJECT_NOT_FOUND" | "PACKAGE_NOT_FOUND" | "INTERNAL_ERROR";
  message: string;
}

// ─── Serialization helper ─────────────────────────────────────────────────────

export function serializeCheckResult(r: CheckResult): SerializedCheckResult {
  return {
    name: r.name,
    status: r.status,
    message: r.message,
    fixable: r.fixable,
    fix: null,
    hint: r.hint,
    wasFixed: r.wasFixed,
  };
}
