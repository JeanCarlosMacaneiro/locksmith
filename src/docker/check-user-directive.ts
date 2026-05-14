import type { DockerIssue } from "../types";

function isFromLine(trimmed: string): boolean {
  return /^FROM\s/i.test(trimmed);
}

function isCmdOrEntrypoint(trimmed: string): boolean {
  return /^(?:CMD|ENTRYPOINT)\b/i.test(trimmed);
}

function parseUserValue(trimmed: string): string | null {
  const m = trimmed.match(/^USER\s+(.+)$/i);
  if (!m) return null;
  return m[1]!.trim();
}

function isRootUser(userValue: string): boolean {
  const v = userValue.replace(/^["']|["']$/g, "").trim();
  return v === "root" || v === "0";
}

function buildMissingUserIssue(anchorLine: number, anchorOriginal: string): DockerIssue {
  const remediationGuide = [
    "The final Dockerfile stage does not configure a non-root user.",
    "By default, containers run as root and a compromise inside the container increases the impact.",
    "Recommended fix: create a user and switch to it before the final CMD/ENTRYPOINT.",
    "Examples:",
    "Alpine: RUN adduser -D appuser && chown -R appuser:appuser /app",
    "Debian/Ubuntu: RUN useradd -m -u 10001 appuser && chown -R appuser:appuser /app",
    "Then: USER appuser",
  ].join("\n");

  return {
    line: anchorLine,
    kind: "missing-cmd",
    severity: "high",
    source: "internal",
    description: "Container runs as root (non-root USER missing in the final stage)",
    original: anchorOriginal,
    replacement: null,
    remediationGuide,
  };
}

function buildExplicitRootUserIssue(lineNum: number, original: string): DockerIssue {
  const remediationGuide = [
    "The final Dockerfile stage explicitly sets USER root/0.",
    "Running as root increases the attack surface in case of container compromise.",
    "Recommended fix: create a non-root user and use USER <user> before the final CMD/ENTRYPOINT.",
    "Example (Alpine): RUN adduser -D appuser && chown -R appuser:appuser /app",
    "Then: USER appuser",
  ].join("\n");

  return {
    line: lineNum,
    kind: "missing-cmd",
    severity: "high",
    source: "internal",
    description: "Container explicitly runs as root (USER root/0 in the final stage)",
    original,
    replacement: null,
    remediationGuide,
  };
}

export function checkUserDirective(lines: string[]): DockerIssue[] {
  const fromIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isFromLine(lines[i]!.trim())) fromIndexes.push(i);
  }

  const start = fromIndexes.length > 0 ? fromIndexes[fromIndexes.length - 1]! : 0;
  const stageLines = lines.slice(start);

  let lastCmdIndex: number | null = null;
  for (let i = 0; i < stageLines.length; i++) {
    const trimmed = stageLines[i]!.trim();
    if (isCmdOrEntrypoint(trimmed)) lastCmdIndex = i;
  }

  const searchEnd = lastCmdIndex ?? (stageLines.length - 1);

  let hasNonRootUser = false;
  for (let i = 0; i <= searchEnd; i++) {
    const trimmed = stageLines[i]!.trim();
    const userValue = parseUserValue(trimmed);
    if (!userValue) continue;

    if (isRootUser(userValue)) {
      return [buildExplicitRootUserIssue(start + i + 1, trimmed)];
    }

    hasNonRootUser = true;
  }

  if (hasNonRootUser) return [];

  const anchorLine = (lastCmdIndex !== null) ? (start + lastCmdIndex + 1) : (start + 1);
  const anchorOriginal = (lastCmdIndex !== null)
    ? stageLines[lastCmdIndex]!.trim()
    : (lines[start]?.trim() ?? "");

  return [buildMissingUserIssue(anchorLine, anchorOriginal)];
}
