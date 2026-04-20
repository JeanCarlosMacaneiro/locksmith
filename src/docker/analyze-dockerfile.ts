import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { DockerfileAnalysis, DockerIssue } from "../types";

function findDockerfiles(projectPath: string): string[] {
  const found: string[] = [];

  try {
    for (const file of readdirSync(projectPath)) {
      if (file === "Dockerfile" || file.startsWith("Dockerfile.")) {
        found.push(join(projectPath, file));
      }
    }
  } catch {}

  for (const sub of ["docker", ".docker"]) {
    const subPath = join(projectPath, sub);
    if (!existsSync(subPath)) continue;
    try {
      for (const file of readdirSync(subPath)) {
        if (file === "Dockerfile" || file.startsWith("Dockerfile.")) {
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

function analyzeNodeLines(lines: string[], issues: DockerIssue[], pnpmVersion?: string): void {
  let npmrcCopied = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    const lineNum = i + 1;

    if (/COPY\s+[^\s]*\.npmrc/.test(trimmed) || /COPY\s+\.\s+/.test(trimmed)) {
      npmrcCopied = true;
    }

    // pnpm installed via npm without pinned version
    if (/\bnpm\s+install\s+(?:-g\s+)?pnpm(?!@)/.test(trimmed)) {
      issues.push({
        line: lineNum,
        kind: "pin-version",
        description: "pnpm no pinned — versión puede diferir en producción",
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
        description: "corepack prepare pnpm sin versión pinned",
        original: trimmed,
        replacement: pnpmVersion
          ? trimmed.replace(/\bpnpm\b(?!@)/, `pnpm@${pnpmVersion}`)
          : null,
      });
    }

    // pnpm install call
    if (/^RUN\b/.test(trimmed) && /\bpnpm\s+install\b/.test(trimmed)) {
      if (!npmrcCopied) {
        issues.push({
          line: lineNum,
          kind: "missing-copy",
          description: ".npmrc no copiado antes de pnpm install — reglas de seguridad no aplican en build",
          original: trimmed,
          replacement: "COPY .npmrc .",
        });
        npmrcCopied = true;
      }

      const missing: string[] = [];
      if (!/--frozen-lockfile/.test(trimmed)) missing.push("--frozen-lockfile");
      if (!/--ignore-scripts/.test(trimmed)) missing.push("--ignore-scripts");

      if (missing.length > 0) {
        issues.push({
          line: lineNum,
          kind: "missing-flag",
          description: `pnpm install sin ${missing.join(", ")}`,
          original: trimmed,
          replacement: `${trimmed} ${missing.join(" ")}`,
        });
      }
    }
  }
}

function analyzePythonLines(lines: string[], issues: DockerIssue[]): void {
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
      if (!/--no-cache-dir/.test(trimmed)) {
        issues.push({
          line: lineNum,
          kind: "missing-flag",
          description: "pip install sin --no-cache-dir — imagen más pesada",
          original: trimmed,
          replacement: trimmed.replace(/\bpip\s+install\b/, "pip install --no-cache-dir"),
        });
      }

      if (/pip\s+install\s+[^|&]*-r\s+requirements/.test(trimmed)) {
        issues.push({
          line: lineNum,
          kind: "advisory",
          description: "pip install -r requirements.txt — considera migrar a Poetry para lockfile reproducible",
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
          description: ".python-version no copiado antes de poetry install — versión Python puede ser incorrecta en build",
          original: trimmed,
          replacement: "COPY .python-version .",
        });
        pythonVersionCopied = true;
      }

      if (!poetryTomlCopied) {
        issues.push({
          line: lineNum,
          kind: "missing-copy",
          description: "poetry.toml no copiado antes de poetry install — virtualenv puede no ser in-project",
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
          description: `poetry install sin ${missing.join(", ")}`,
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
    if (issue.replacement !== null) {
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

    const copyIssues  = lineIssues.filter(x => x.kind === "missing-copy");
    const otherIssues = lineIssues.filter(x => x.kind !== "missing-copy");

    // Prepend COPY lines before the RUN line
    for (const ci of copyIssues) {
      result.push(ci.replacement!);
    }

    // Apply non-copy replacements (pin-version, missing-flag) to the line itself
    let finalTrimmed = line.trim();
    for (const oi of otherIssues) {
      if (oi.replacement) finalTrimmed = oi.replacement;
    }

    const indent = line.match(/^(\s*)/)?.[1] ?? "";
    result.push(indent + finalTrimmed);
  }

  return result.join("\n");
}

export function analyzeDockerfile(projectPath: string, projectType: string): DockerfileAnalysis[] {
  const paths = findDockerfiles(projectPath);

  if (paths.length === 0) {
    return [{ found: false, dockerfilePath: null, issues: [], proposedContent: null }];
  }

  const pnpmVersion = projectType !== "python" ? getPnpmVersion(projectPath) : undefined;

  return paths.map((dockerfilePath) => {
    const content = readFileSync(dockerfilePath, "utf-8");
    const lines   = content.split("\n");
    const issues: DockerIssue[] = [];

    if (projectType === "node" || projectType === "bun") {
      analyzeNodeLines(lines, issues, pnpmVersion);
    } else if (projectType === "python") {
      analyzePythonLines(lines, issues);
    }

    const fixableCount   = issues.filter(x => x.replacement !== null).length;
    const proposedContent = fixableCount > 0 ? buildProposedContent(lines, issues) : null;

    return { found: true, dockerfilePath, issues, proposedContent };
  });
}
