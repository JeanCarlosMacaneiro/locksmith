import type { DockerIssue, DockerSeverity, QualityGateSummary } from "../types";

const ORDER: Record<DockerSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function normalizeSeverity(sev: DockerIssue["severity"]): DockerSeverity {
  return sev ?? "info";
}

export function evaluateQualityGate(
  issues: DockerIssue[],
  failOn: DockerSeverity | "none",
): { qualityGatePassed: boolean; qualityGateSummary: QualityGateSummary } {
  const summary: QualityGateSummary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const i of issues) {
    const s = normalizeSeverity(i.severity);
    summary[s] += 1;
  }

  if (failOn === "none") {
    return { qualityGatePassed: true, qualityGateSummary: summary };
  }

  const threshold = ORDER[failOn];
  const hasBlocking = issues.some((i) => ORDER[normalizeSeverity(i.severity)] >= threshold);
  return { qualityGatePassed: !hasBlocking, qualityGateSummary: summary };
}
