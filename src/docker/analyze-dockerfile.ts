import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { DockerfileAnalysis, DockerIssue } from "../types";
import { checkLayerCache } from "./check-layer-cache";
import { checkUserDirective } from "./check-user-directive";
import { checkDockerignore } from "./check-dockerignore";
import { checkMultistage } from "./check-multistage";
import { checkAptCleanup } from "./check-apt-cleanup";

function findDockerfiles(projectPath: string): string[] {
  const found: string[] = [];

  try {
    for (const file of readdirSync(projectPath)) {
      if (file.toLowerCase() === "dockerfile" || file.toLowerCase().startsWith("dockerfile.")) {
        found.push(join(projectPath, file));
      }
    }
  } catch {}

  for (const sub of ["docker", ".docker"]) {
    const subPath = join(projectPath, sub);
    if (!existsSync(subPath)) continue;
    try {
      for (const file of readdirSync(subPath)) {
        if (file.toLowerCase() === "dockerfile" || file.toLowerCase().startsWith("dockerfile.")) {
          found.push(join(subPath, file));
        }
      }
    } catch {}
  }

  return found;
}

function getPnpmVersion(projectPath: string): string | undefined {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  try {
    const pm: unknown = JSON.parse(readFileSync(pkgPath, "utf-8")).packageManager;
    if (typeof pm === "string" && /^pnpm@\d+\.\d+\.\d+$/.test(pm)) {
      return pm.slice("pnpm@".length);
    }
  } catch {}
  return undefined;
}

function isPoetryProject(projectPath: string): boolean {
  const pyprojectPath = join(projectPath, "pyproject.toml");
  const poetryLockPath = join(projectPath, "poetry.lock");
  if (existsSync(poetryLockPath)) return true;
  if (!existsSync(pyprojectPath)) return false;
  try {
    return readFileSync(pyprojectPath, "utf-8").includes("[tool.poetry]");
  } catch {}
  return false;
}

// Returns true if this is a node-based stage.
function checkFromNodeVersion(trimmed: string, lineNum: number, issues: DockerIssue[]): boolean {
  // Skip build flags like --platform
  const match = trimmed.match(/^FROM\s+(?:--\S+\s+)*([^\s:@]+)(?::([^\s@]+))?/i);
  if (!match) return false;

  const image = match[1]!.toLowerCase();
  if (image !== "node") return false;

  let fixed = trimmed;
  const reasons: string[] = [];

  // Fix lowercase 'as' stage alias → 'AS'
  if (/\s+as\s+\S/.test(fixed)) {
    fixed = fixed.replace(/(\s+as)(\s+)/, (m) => m.replace("as", "AS"));
    reasons.push("'as' → 'AS' (normalized)");
  }

  const tag = match[2];

  if (!tag || tag === "latest") {
    fixed = tag === "latest"
      ? fixed.replace("node:latest", "node:20-alpine")
      : fixed.replace(/\bnode\b(?!:)/, "node:20-alpine");
    reasons.push("no explicit LTS version");
  } else if (!/^(?:lts|current)/.test(tag)) {
    const versionMatch = tag.match(/^(\d+)(.*)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1]!, 10);
      if (major < 20) {
        // Strip minor.patch if present (e.g. "18.20.0-alpine" → "-alpine"), keep suffix
        const suffix = versionMatch[2]!.replace(/^(?:\.\d+)+/, "");
        const newTag = `20${suffix}`;
        const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        fixed = fixed.replace(new RegExp(`node:${escapedTag}`), `node:${newTag}`);
        reasons.push(`Node ${major} EOL, upgrade to Node 20`);
      }
    }
  }

  if (reasons.length > 0 && fixed !== trimmed) {
    issues.push({
      line: lineNum,
      kind: "update-from",
      description: reasons.join(" · "),
      original: trimmed,
      replacement: fixed,
    });
  }

  return true;
}

function analyzeNodeLines(lines: string[], issues: DockerIssue[], pnpmVersion?: string): void {
  let npmrcCopied    = false;
  let lockfileCopied = false;
  let pnpmInstalled  = false;
  let ciEnvSet       = false;
  let inNodeStage    = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    const lineNum = i + 1;

    // Stage boundary — reset per-stage state
    if (/^FROM\s/i.test(trimmed)) {
      npmrcCopied    = false;
      lockfileCopied = false;
      pnpmInstalled  = false;
      ciEnvSet       = false;
      inNodeStage    = checkFromNodeVersion(trimmed, lineNum, issues);
      continue;
    }

    if (!inNodeStage) continue;

    const isCopyAll = /COPY\s+\.\s+/.test(trimmed);
    if (/COPY\s+[^\s]*\.npmrc/.test(trimmed) || isCopyAll) {
      npmrcCopied = true;
    }
    if (/COPY\s+.*pnpm-lock\.yaml/.test(trimmed) || isCopyAll) {
      lockfileCopied = true;
    }
    if (/^(?:ENV|ARG)\s+CI(?:=|\s+)/.test(trimmed) || /^ENV\s+.*\bCI=/.test(trimmed)) {
      ciEnvSet = true;
    }

    // Track pnpm availability in this stage
    if (
      /\bnpm\s+install\s+(?:-g\s+)?pnpm/.test(trimmed) ||
      /\bcorepack\s+enable\b/.test(trimmed) ||
      /\bcorepack\s+prepare\s+pnpm/.test(trimmed)
    ) {
      pnpmInstalled = true;
    }

    // pnpm installed via npm without pinned version
    if (/\bnpm\s+install\s+(?:-g\s+)?pnpm(?!@)/.test(trimmed)) {
      issues.push({
        line: lineNum,
        kind: "pin-version",
        description: "pnpm not pinned — version may differ in production",
        original: trimmed,
        replacement: pnpmVersion
          ? trimmed.replace(/\bpnpm\b(?!@)/, `pnpm@${pnpmVersion}`)
          : null,
      });
    }

    // corepack prepare pnpm without pinned version
    if (/\bcorepack\s+prepare\s+pnpm(?!@)/.test(trimmed)) {
      issues.push({
        line: lineNum,
        kind: "pin-version",
        description: "corepack prepare pnpm without pinned version",
        original: trimmed,
        replacement: pnpmVersion
          ? trimmed.replace(/\bpnpm\b(?!@)/, `pnpm@${pnpmVersion}`)
          : null,
      });
    }

    // pnpm install call
    if (/^RUN\b/.test(trimmed) && /\bpnpm\s+install\b/.test(trimmed)) {
      if (!pnpmInstalled) {
        issues.push({
          line: lineNum,
          kind: "missing-cmd",
          description: "pnpm not installed in this stage — missing corepack enable or npm install -g pnpm@X",
          original: trimmed,
          replacement: "RUN corepack enable",
        });
        pnpmInstalled = true;
      }

      if (!npmrcCopied) {
        issues.push({
          line: lineNum,
          kind: "missing-copy",
          description: ".npmrc not copied before pnpm install — security rules do not apply in build",
          original: trimmed,
          replacement: "COPY .npmrc .",
        });
        npmrcCopied = true;
      }

      if (!lockfileCopied) {
        issues.push({
          line: lineNum,
          kind: "missing-copy",
          description: "pnpm-lock.yaml not copied — pnpm install --frozen-lockfile fails without lockfile",
          original: trimmed,
          replacement: "COPY pnpm-lock.yaml .",
        });
        lockfileCopied = true;
      }

      if (!ciEnvSet) {
        issues.push({
          line: lineNum,
          kind: "missing-cmd",
          description: "ENV CI=true missing — pnpm fails without TTY in CI/Docker (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY)",
          original: trimmed,
          replacement: "ENV CI=true",
        });
        ciEnvSet = true;
      }

      const missing: string[] = [];
      if (!/--frozen-lockfile/.test(trimmed)) missing.push("--frozen-lockfile");
      if (!/--ignore-scripts/.test(trimmed)) missing.push("--ignore-scripts");

      if (missing.length > 0) {
        issues.push({
          line: lineNum,
          kind: "missing-flag",
          description: `pnpm install without ${missing.join(", ")}`,
          original: trimmed,
          replacement: `${trimmed} ${missing.join(" ")}`,
        });
      }
    }

    // npm used but project declares pnpm — switch to pnpm
    if (
      pnpmVersion &&
      /^RUN\b/.test(trimmed) &&
      /\bnpm\s+(?:install|i|ci)\b/.test(trimmed) &&
      !/\bnpm\s+(?:install|i)\s+(?:-g\s+)?pnpm/.test(trimmed) &&
      !/\bnpm\s+(?:install|i)\s+-g\b/.test(trimmed)
    ) {
      // Same prerequisite checks as the native pnpm install block
      if (!pnpmInstalled) {
        issues.push({
          line: lineNum,
          kind: "missing-cmd",
          description: "pnpm not installed in this stage — missing corepack enable or npm install -g pnpm@X",
          original: trimmed,
          replacement: "RUN corepack enable",
        });
        pnpmInstalled = true;
      }
      if (!npmrcCopied) {
        issues.push({
          line: lineNum,
          kind: "missing-copy",
          description: ".npmrc not copied before pnpm install — security rules do not apply in build",
          original: trimmed,
          replacement: "COPY .npmrc .",
        });
        npmrcCopied = true;
      }
      if (!lockfileCopied) {
        issues.push({
          line: lineNum,
          kind: "missing-copy",
          description: "pnpm-lock.yaml not copied — pnpm install --frozen-lockfile fails without lockfile",
          original: trimmed,
          replacement: "COPY pnpm-lock.yaml .",
        });
        lockfileCopied = true;
      }
      if (!ciEnvSet) {
        issues.push({
          line: lineNum,
          kind: "missing-cmd",
          description: "ENV CI=true missing — pnpm fails without TTY in CI/Docker (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY)",
          original: trimmed,
          replacement: "ENV CI=true",
        });
        ciEnvSet = true;
      }
      issues.push({
        line: lineNum,
        kind: "missing-flag",
        description: "project uses pnpm but Dockerfile uses npm — use pnpm install",
        original: trimmed,
        replacement: trimmed.replace(
          /\bnpm\s+(?:install|i|ci)\b(?:\s+--\S+)*/,
          "pnpm install --frozen-lockfile --ignore-scripts",
        ),
      });
      continue;
    }

    // npm install / npm i (not installing pnpm itself, not npm ci)
    if (
      /^RUN\b/.test(trimmed) &&
      /\bnpm\s+(?:install|i)\b/.test(trimmed) &&
      !/\bnpm\s+(?:install|i)\s+[^|&\s]/.test(trimmed) &&
      !/\bnpm\s+(?:install|i)\s+(?:-g\s+)?pnpm/.test(trimmed)
    ) {
      issues.push({
        line: lineNum,
        kind: "missing-flag",
        description: "npm install does not reproduce deterministic builds — use npm ci",
        original: trimmed,
        replacement: trimmed.replace(/\bnpm\s+(?:install|i)\b/, "npm ci"),
      });
    }

    // npm ci without --ignore-scripts
    if (/^RUN\b/.test(trimmed) && /\bnpm\s+ci\b/.test(trimmed)) {
      if (!/--ignore-scripts/.test(trimmed)) {
        issues.push({
          line: lineNum,
          kind: "missing-flag",
          description: "npm ci without --ignore-scripts — postinstall scripts run in build",
          original: trimmed,
          replacement: `${trimmed} --ignore-scripts`,
        });
      }
    }
  }
}

function analyzePythonLines(lines: string[], issues: DockerIssue[], isPoetry?: boolean): void {
  let pythonVersionCopied = false;
  let poetryTomlCopied = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    const lineNum = i + 1;

    if (/COPY\s+[^\s]*\.python-version/.test(trimmed) || /COPY\s+\.\s+/.test(trimmed)) {
      pythonVersionCopied = true;
    }
    if (/COPY\s+[^\s]*poetry\.toml/.test(trimmed) || /COPY\s+\.\s+/.test(trimmed)) {
      poetryTomlCopied = true;
    }

    // pip install
    if (/^RUN\b/.test(trimmed) && /\bpip\s+install\b/.test(trimmed)) {
      // project uses poetry but Dockerfile uses pip
      if (isPoetry && !/\bpip\s+install\s+poetry\b/.test(trimmed)) {
        issues.push({
          line: lineNum,
          kind: "missing-flag",
          description: "project uses Poetry but Dockerfile uses pip — use poetry install",
          original: trimmed,
          replacement: "RUN poetry install --no-interaction --no-root",
        });
        continue;
      }

      if (!/--no-cache-dir/.test(trimmed)) {
        issues.push({
          line: lineNum,
          kind: "missing-flag",
          description: "pip install without --no-cache-dir — larger image size",
          original: trimmed,
          replacement: trimmed.replace(/\bpip\s+install\b/, "pip install --no-cache-dir"),
        });
      }

      if (/pip\s+install\s+[^|&]*-r\s+requirements/.test(trimmed)) {
        issues.push({
          line: lineNum,
          kind: "advisory",
          description: "pip install -r requirements.txt — consider migrating to Poetry for a reproducible lockfile",
          original: trimmed,
          replacement: null,
        });
      }
    }

    // poetry install
    if (/^RUN\b/.test(trimmed) && /\bpoetry\s+install\b/.test(trimmed)) {
      if (!pythonVersionCopied) {
        issues.push({
          line: lineNum,
          kind: "missing-copy",
          description: ".python-version not copied before poetry install — Python version may be incorrect in build",
          original: trimmed,
          replacement: "COPY .python-version .",
        });
        pythonVersionCopied = true;
      }

      if (!poetryTomlCopied) {
        issues.push({
          line: lineNum,
          kind: "missing-copy",
          description: "poetry.toml not copied before poetry install — virtualenv may not be in-project",
          original: trimmed,
          replacement: "COPY poetry.toml .",
        });
        poetryTomlCopied = true;
      }

      const missing: string[] = [];
      if (!/--no-interaction/.test(trimmed)) missing.push("--no-interaction");
      if (!/--no-root/.test(trimmed)) missing.push("--no-root");

      if (missing.length > 0) {
        issues.push({
          line: lineNum,
          kind: "missing-flag",
          description: `poetry install without ${missing.join(", ")}`,
          original: trimmed,
          replacement: `${trimmed} ${missing.join(" ")}`,
        });
      }
    }
  }
}

export function buildProposedContent(lines: string[], issues: DockerIssue[]): string {
  const byLine = new Map<number, DockerIssue[]>();
  for (const issue of issues) {
    if (issue.replacement !== null && !issue.original.startsWith(".dockerignore")) {
      const arr = byLine.get(issue.line) ?? [];
      arr.push(issue);
      byLine.set(issue.line, arr);
    }
  }

  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i]!;
    const lineIssues = byLine.get(lineNum);

    if (!lineIssues || lineIssues.length === 0) {
      result.push(line);
      continue;
    }

    // insert-before kinds (prepend new lines before the current line)
    const insertIssues  = lineIssues.filter(x => x.kind === "missing-copy" || x.kind === "missing-cmd");
    // replace kinds (substitute the current line itself)
    const replaceIssues = lineIssues.filter(x => x.kind !== "missing-copy" && x.kind !== "missing-cmd");

    for (const ii of insertIssues) {
      result.push(ii.replacement!);
    }

    let finalTrimmed = line.trim();
    for (const ri of replaceIssues) {
      if (ri.replacement) finalTrimmed = ri.replacement;
    }

    const indent = line.match(/^(\s*)/)?.[1] ?? "";
    result.push(indent + finalTrimmed);
  }

  return result.join("\n");
}

function defaultSeverityForKind(kind: DockerIssue["kind"]): "critical" | "high" | "medium" | "low" | "info" {
  if (kind === "pin-version" || kind === "missing-cmd") return "high";
  if (kind === "missing-flag" || kind === "missing-copy" || kind === "update-from") return "medium";
  if (kind === "advisory") return "low";
  return "info";
}

function buildDefaultRemediationGuide(issue: DockerIssue): string {
  const base = [
    issue.description,
    issue.replacement !== null ? "Fix example:" : "Recommended fix: review the instruction and apply best practices.",
    issue.replacement !== null ? issue.replacement : "",
  ]
    .filter((x) => x !== "")
    .join("\n");

  return base.trim() === "" ? "Review this issue and apply the recommended remediation." : base;
}

function enrichIssues(issues: DockerIssue[]): void {
  for (const issue of issues) {
    if (!issue.source) issue.source = "internal";
    if (!issue.severity) issue.severity = defaultSeverityForKind(issue.kind);
    if (!issue.remediationGuide) issue.remediationGuide = buildDefaultRemediationGuide(issue);
    if (issue.replacement !== null && !issue.remediationGuide.includes(issue.replacement)) {
      issue.remediationGuide = `${issue.remediationGuide}\n${issue.replacement}`;
    }
  }
}

export function analyzeDockerfile(
  projectPath: string,
  projectType: string,
  opts?: { security?: boolean },
): DockerfileAnalysis[] {
  const paths = findDockerfiles(projectPath);

  if (paths.length === 0) {
    return [{ found: false, dockerfilePath: null, issues: [], proposedContent: null }];
  }

  const pnpmVersion = projectType !== "python" ? getPnpmVersion(projectPath) : undefined;
  const poetryProject = projectType === "python" ? isPoetryProject(projectPath) : false;
  const security = Boolean(opts?.security);
  const dockerignoreIssues = security ? checkDockerignore(projectPath) : [];

  return paths.map((dockerfilePath) => {
    const content = readFileSync(dockerfilePath, "utf-8");
    const lines   = content.split("\n");
    const issues: DockerIssue[] = [];

    if (projectType === "node" || projectType === "bun") {
      analyzeNodeLines(lines, issues, pnpmVersion);
    } else if (projectType === "python") {
      analyzePythonLines(lines, issues, poetryProject);
    }

    if (security) {
      issues.push(...checkLayerCache(lines, projectType));
      issues.push(...checkUserDirective(lines));
      issues.push(...checkMultistage(lines, projectType));
      issues.push(...checkAptCleanup(lines));
      issues.push(...dockerignoreIssues);
    }

    enrichIssues(issues);

    const dockerfileFixableCount = issues.filter(x => x.replacement !== null && !x.original.startsWith(".dockerignore")).length;
    const proposedContent = dockerfileFixableCount > 0 ? buildProposedContent(lines, issues) : null;

    return { found: true, dockerfilePath, issues, proposedContent };
  });
}
