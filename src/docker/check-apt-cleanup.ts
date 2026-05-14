import type { DockerIssue } from "../types";

function isRunLine(trimmed: string): boolean {
  return /^RUN\b/i.test(trimmed);
}

function isAptInstall(trimmed: string): boolean {
  return /\bapt-get\s+install\b/i.test(trimmed);
}

function hasAptCleanup(trimmed: string): boolean {
  return /\bapt-get\s+clean\b/i.test(trimmed) || /rm\s+-rf\s+\/var\/lib\/apt\/lists\/\*/i.test(trimmed);
}

function buildIssue(lineNum: number, original: string): DockerIssue {
  const remediationGuide = [
    "apt-get install detected without cleanup in the same RUN layer.",
    "This leaves APT caches inside the image, increasing size and attack surface.",
    "Recommended fix: add the cleanup in the same RUN. Example:",
    "RUN apt-get update && apt-get install -y --no-install-recommends <packages> && rm -rf /var/lib/apt/lists/*",
  ].join("\n");

  return {
    line: lineNum,
    kind: "missing-flag",
    severity: "medium",
    source: "internal",
    description: "apt-get install without cleanup (rm -rf /var/lib/apt/lists/* or apt-get clean) in the same RUN",
    original,
    replacement: null,
    remediationGuide,
  };
}

export function checkAptCleanup(lines: string[]): DockerIssue[] {
  const issues: DockerIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!isRunLine(trimmed)) continue;
    if (!isAptInstall(trimmed)) continue;
    if (hasAptCleanup(trimmed)) continue;
    issues.push(buildIssue(i + 1, trimmed));
  }
  return issues;
}
