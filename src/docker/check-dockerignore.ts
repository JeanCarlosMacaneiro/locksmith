import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { DockerIssue } from "../types";
import { generateBaseDockerignore, SENSITIVE_PATTERNS } from "./fix-dockerignore";

function normalizeDockerignoreLine(line: string): string {
  return line.trim();
}

function parseDockerignorePatterns(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map(normalizeDockerignoreLine)
    .filter((l) => l !== "" && !l.startsWith("#") && !l.startsWith("!"));
}

function dockerignoreHasExactPattern(patterns: string[], pattern: string): boolean {
  const target = normalizeDockerignoreLine(pattern);
  return patterns.some((p) => normalizeDockerignoreLine(p) === target);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(glob: string): RegExp {
  const escaped = escapeRegExp(glob)
    .replace(/\\\*\\\*/g, "§§DOUBLESTAR§§")
    .replace(/\\\*/g, "[^/]*")
    .replace(/§§DOUBLESTAR§§/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function patternMatchesPath(pattern: string, relPath: string): boolean {
  const p = normalizeDockerignoreLine(pattern);
  const normalized = relPath.split("\\").join("/");
  if (p.endsWith("/")) {
    const dir = p.slice(0, -1);
    return normalized === dir || normalized.startsWith(`${dir}/`);
  }
  if (!p.includes("/")) {
    const base = normalized.split("/").pop() ?? normalized;
    return globToRegExp(p).test(base);
  }
  return globToRegExp(p).test(normalized);
}

function isSensitiveMatchForPattern(pattern: string, relPath: string): boolean {
  return patternMatchesPath(pattern, relPath);
}

function listFilesRecursively(projectPath: string, maxEntries: number): string[] {
  const out: string[] = [];
  const stack: string[] = [projectPath];
  while (stack.length > 0 && out.length < maxEntries) {
    const dir = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (out.length >= maxEntries) break;
      if (name === ".git" || name === "node_modules" || name === "dist" || name === "build") continue;
      const abs = join(dir, name);
      let st: ReturnType<typeof statSync> | null = null;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (st.isFile()) out.push(abs);
    }
  }
  return out;
}

function buildMissingPatternIssue(pattern: string): DockerIssue {
  const replacement = `${normalizeDockerignoreLine(pattern)}\n`.trimEnd();
  const remediationGuide = [
    "A critical entry is missing in .dockerignore.",
    "Without that exclusion, sensitive files may be accidentally included in the build context and end up inside the image.",
    "Add this line to the end of your .dockerignore:",
    replacement,
  ].join("\n");

  return {
    line: 1,
    kind: "missing-copy",
    severity: "medium",
    source: "internal",
    description: `Missing entry in .dockerignore: ${normalizeDockerignoreLine(pattern)}`,
    original: ".dockerignore",
    replacement,
    remediationGuide,
  };
}

function buildMissingDockerignoreIssue(): DockerIssue {
  const replacement = generateBaseDockerignore();
  const remediationGuide = [
    "No .dockerignore file exists in the project.",
    "Without .dockerignore, Docker may copy credentials, environment files, and other artifacts into the build context.",
    "Create a secure base .dockerignore with this content:",
    replacement.trimEnd(),
  ].join("\n");

  return {
    line: 1,
    kind: "missing-copy",
    severity: "medium",
    source: "internal",
    description: "Missing .dockerignore — add exclusions for sensitive files",
    original: ".dockerignore (missing)",
    replacement,
    remediationGuide,
  };
}

function buildExposedSensitiveFileIssue(relPath: string): DockerIssue {
  const replacement = relPath.split("\\").join("/");
  const remediationGuide = [
    "A sensitive file was detected in the project that is not covered by .dockerignore.",
    "If Docker copies this file into the build context, it may end up in the image or leak into layers/caches.",
    "Add this line to .dockerignore to exclude it:",
    replacement,
  ].join("\n");

  return {
    line: 1,
    kind: "missing-copy",
    severity: "high",
    source: "internal",
    description: `Sensitive file not excluded by .dockerignore: ${replacement}`,
    original: ".dockerignore",
    replacement,
    remediationGuide,
  };
}

export function checkDockerignore(projectPath: string): DockerIssue[] {
  const dockerignorePath = join(projectPath, ".dockerignore");
  if (!existsSync(dockerignorePath)) {
    return [buildMissingDockerignoreIssue()];
  }

  let content = "";
  try {
    content = readFileSync(dockerignorePath, "utf-8");
  } catch {
    return [buildMissingDockerignoreIssue()];
  }

  const patterns = parseDockerignorePatterns(content);
  const issues: DockerIssue[] = [];

  for (const p of SENSITIVE_PATTERNS) {
    if (!dockerignoreHasExactPattern(patterns, p)) {
      issues.push(buildMissingPatternIssue(p));
    }
  }

  const files = listFilesRecursively(projectPath, 5000);
  const relFiles = files.map((abs) => relative(projectPath, abs));

  for (const relPath of relFiles) {
    const normalized = relPath.split("\\").join("/");
    const matchesSensitive = SENSITIVE_PATTERNS.some((sp) => isSensitiveMatchForPattern(sp, normalized));
    if (!matchesSensitive) continue;

    const covered = patterns.some((p) => patternMatchesPath(p, normalized));
    if (!covered) {
      issues.push(buildExposedSensitiveFileIssue(normalized));
    }
  }

  return issues;
}
