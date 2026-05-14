import type { DockerIssue } from "../types";

function countFrom(lines: string[]): number {
  return lines.filter((l) => /^FROM\s/i.test(l.trim())).length;
}

function isRun(line: string): boolean {
  return /^RUN\b/i.test(line.trim());
}

function installsBuildTools(trimmed: string): boolean {
  const t = trimmed.toLowerCase();
  if (!isRun(t)) return false;

  const apt = /\bapt-get\s+install\b/.test(t) && /\b(build-essential|gcc|g\+\+|make|cmake|musl-dev|python3-dev)\b/.test(t);
  const apk = /\bapk\s+add\b/.test(t) && /\b(build-base|gcc|g\+\+|make|cmake|musl-dev|python3-dev)\b/.test(t);
  return apt || apk;
}

function looksLikeNodeBuildStep(trimmed: string): boolean {
  const t = trimmed.toLowerCase();
  if (!isRun(t)) return false;
  return /\b(npm|pnpm|yarn)\s+run\s+build\b/.test(t) || /\btsc\b/.test(t);
}

function installsNodeDepsIncludingDev(trimmed: string): boolean {
  const t = trimmed.toLowerCase();
  if (!isRun(t)) return false;
  if (!/\b(pnpm|npm|yarn)\b/.test(t)) return false;
  if (!/\b(install|ci)\b/.test(t)) return false;

  const hasProdFlag = /\b--prod\b/.test(t) || /\b--production\b/.test(t) || /\b--only=production\b/.test(t) || /\b--omit=dev\b/.test(t);
  return !hasProdFlag;
}

function buildIssue(lineNum: number, original: string): DockerIssue {
  const remediationGuide = [
    "The Dockerfile looks like a good candidate for multi-stage builds.",
    "In a single-stage build, build tools/devDependencies may end up in the final image, increasing size and risk.",
    "Recommended fix: use a build stage to install dependencies and compile, and a minimal final stage that copies only required artifacts.",
  ].join("\n");

  return {
    line: lineNum,
    kind: "advisory",
    severity: "medium",
    source: "internal",
    description: "Multi-stage build candidate (single-stage with build/devDependencies signals)",
    original,
    replacement: null,
    remediationGuide,
  };
}

export function checkMultistage(lines: string[], projectType: string): DockerIssue[] {
  if (countFrom(lines) >= 2) return [];

  let bestLine: { lineNum: number; original: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const isCandidate = installsBuildTools(trimmed)
      || looksLikeNodeBuildStep(trimmed)
      || ((projectType === "node" || projectType === "bun" || projectType === "unknown") && installsNodeDepsIncludingDev(trimmed));

    if (!isCandidate) continue;

    bestLine = { lineNum: i + 1, original: trimmed };
    break;
  }

  if (!bestLine) return [];
  return [buildIssue(bestLine.lineNum, bestLine.original)];
}
