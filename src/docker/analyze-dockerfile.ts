import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { DockerfileAnalysis, DockerIssue } from "../types";

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
    reasons.push("'as' → 'AS'");
  }

  const tag = match[2];

  if (!tag || tag === "latest") {
    fixed = tag === "latest"
      ? fixed.replace("node:latest", "node:20-alpine")
      : fixed.replace(/\bnode\b(?!:)/, "node:20-alpine");
    reasons.push("sin versión LTS explícita");
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
        reasons.push(`Node ${major} EOL, actualizar a Node 20`);
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
      if (!pnpmInstalled) {
        issues.push({
          line: lineNum,
          kind: "missing-cmd",
          description: "pnpm no instalado en este stage — falta corepack enable o npm install -g pnpm@X",
          original: trimmed,
          replacement: "RUN corepack enable",
        });
        pnpmInstalled = true;
      }

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

      if (!lockfileCopied) {
        issues.push({
          line: lineNum,
          kind: "missing-copy",
          description: "pnpm-lock.yaml no copiado — pnpm install --frozen-lockfile falla sin lockfile",
          original: trimmed,
          replacement: "COPY pnpm-lock.yaml .",
        });
        lockfileCopied = true;
      }

      if (!ciEnvSet) {
        issues.push({
          line: lineNum,
          kind: "missing-cmd",
          description: "ENV CI=true faltante — pnpm falla sin TTY en CI/Docker (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY)",
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
          description: `pnpm install sin ${missing.join(", ")}`,
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
          description: "pnpm no instalado en este stage — falta corepack enable o npm install -g pnpm@X",
          original: trimmed,
          replacement: "RUN corepack enable",
        });
        pnpmInstalled = true;
      }
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
      if (!lockfileCopied) {
        issues.push({
          line: lineNum,
          kind: "missing-copy",
          description: "pnpm-lock.yaml no copiado — pnpm install --frozen-lockfile falla sin lockfile",
          original: trimmed,
          replacement: "COPY pnpm-lock.yaml .",
        });
        lockfileCopied = true;
      }
      if (!ciEnvSet) {
        issues.push({
          line: lineNum,
          kind: "missing-cmd",
          description: "ENV CI=true faltante — pnpm falla sin TTY en CI/Docker (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY)",
          original: trimmed,
          replacement: "ENV CI=true",
        });
        ciEnvSet = true;
      }
      issues.push({
        line: lineNum,
        kind: "missing-flag",
        description: "proyecto usa pnpm pero Dockerfile usa npm — usa pnpm install",
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
        description: "npm install no reproduce builds deterministas — usa npm ci",
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
          description: "npm ci sin --ignore-scripts — postinstall scripts corren en build",
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
          description: "proyecto usa Poetry pero Dockerfile usa pip — usa poetry install",
          original: trimmed,
          replacement: "RUN poetry install --no-interaction --no-root",
        });
        continue;
      }

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

export function analyzeDockerfile(projectPath: string, projectType: string): DockerfileAnalysis[] {
  const paths = findDockerfiles(projectPath);

  if (paths.length === 0) {
    return [{ found: false, dockerfilePath: null, issues: [], proposedContent: null }];
  }

  const pnpmVersion = projectType !== "python" ? getPnpmVersion(projectPath) : undefined;
  const poetryProject = projectType === "python" ? isPoetryProject(projectPath) : false;

  return paths.map((dockerfilePath) => {
    const content = readFileSync(dockerfilePath, "utf-8");
    const lines   = content.split("\n");
    const issues: DockerIssue[] = [];

    if (projectType === "node" || projectType === "bun") {
      analyzeNodeLines(lines, issues, pnpmVersion);
    } else if (projectType === "python") {
      analyzePythonLines(lines, issues, poetryProject);
    }

    const fixableCount   = issues.filter(x => x.replacement !== null).length;
    const proposedContent = fixableCount > 0 ? buildProposedContent(lines, issues) : null;

    return { found: true, dockerfilePath, issues, proposedContent };
  });
}
