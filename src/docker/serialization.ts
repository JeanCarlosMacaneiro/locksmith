import { z } from "zod";
import type { DockerSecurityReport } from "../types";

const DockerIssueSchema = z.object({
  line: z.number(),
  kind: z.enum(["pin-version", "missing-flag", "missing-copy", "missing-cmd", "update-from", "advisory"]),
  description: z.string(),
  original: z.string(),
  replacement: z.string().nullable(),
  severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
  remediationGuide: z.string().optional(),
  source: z.enum(["internal", "hadolint", "trivy", "docker-scout"]).optional(),
  cveId: z.string().optional(),
  hadolintCode: z.string().optional(),
});

const ScannerStatusSchema = z.object({
  name: z.string(),
  status: z.enum(["ok", "skipped", "unavailable", "error"]),
  issuesFound: z.number(),
});

const QualityGateSummarySchema = z.object({
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
  info: z.number(),
});

const DockerSecurityReportSchema = z.object({
  found: z.boolean(),
  dockerfilePath: z.string().nullable(),
  issues: z.array(DockerIssueSchema),
  issueCount: z.number(),
  hasFixableIssues: z.boolean(),
  qualityGatePassed: z.boolean(),
  qualityGateSummary: QualityGateSummarySchema,
  internalChecksRan: z.boolean(),
  scanners: z.array(ScannerStatusSchema),
  llmFixInstructions: z.string().optional(),
});

export function parseDockerSecurityReport(json: string): DockerSecurityReport | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (e) {
    return { error: `Malformed JSON: ${String(e)}` };
  }

  const res = DockerSecurityReportSchema.safeParse(parsed);
  if (!res.success) {
    return { error: "Missing required fields in DockerSecurityReport" };
  }

  return res.data satisfies DockerSecurityReport;
}
