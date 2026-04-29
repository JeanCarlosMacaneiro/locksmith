import type { DockerIssue } from "../types";

function isFromLine(trimmed: string): boolean {
  return /^FROM\s/i.test(trimmed);
}

function isRunLine(trimmed: string): boolean {
  return /^RUN\b/i.test(trimmed);
}

function isCommentOrBlank(line: string): boolean {
  const t = line.trim();
  return t === "" || t.startsWith("#");
}

function isCopyAll(trimmed: string): boolean {
  return /^COPY\s+\.\s+(?:\.|\/app)(?:\s|$)/i.test(trimmed);
}

function isDepsInstall(trimmed: string, projectType: string): boolean {
  if (!isRunLine(trimmed)) return false;
  const t = trimmed.toLowerCase();
  const node = /\b(pnpm|npm|yarn)\b/.test(t) && /\b(install|ci)\b/.test(t);
  const py = /\b(pip|poetry)\b/.test(t) && /\binstall\b/.test(t);
  if (projectType === "node" || projectType === "bun") return node;
  if (projectType === "python") return py;
  return node || py;
}

function hasAptCleanup(trimmed: string): boolean {
  return /\bapt-get\s+clean\b/i.test(trimmed) || /rm\s+-rf\s+\/var\/lib\/apt\/lists\/\*/i.test(trimmed);
}

function hasApkNoCache(trimmed: string): boolean {
  return /\bapk\s+add\b/i.test(trimmed) && /\s--no-cache\b/i.test(trimmed);
}

function buildCopyBeforeInstallIssue(lineNum: number, original: string): DockerIssue {
  const remediationGuide = [
    "Se copia el código fuente completo antes de instalar dependencias.",
    "Esto invalida el cache de Docker en cada cambio de código y ralentiza builds.",
    "Solución recomendada: copia primero solo manifests/lockfiles, instala dependencias, y recién luego copia el resto del código.",
  ].join("\n");

  return {
    line: lineNum,
    kind: "advisory",
    severity: "medium",
    source: "internal",
    description: "Layer caching ineficiente: COPY . ... antes de instalar dependencias en el mismo stage",
    original,
    replacement: null,
    remediationGuide,
  };
}

function buildPackageCleanupIssue(lineNum: number, original: string, manager: "apt" | "apk"): DockerIssue {
  const remediationGuide = manager === "apt"
    ? [
      "Se detectó apt-get install sin cleanup en la misma capa RUN.",
      "Esto deja cachés de APT dentro de la imagen, aumentando tamaño y superficie de ataque.",
      "Solución recomendada: agrega el cleanup en el mismo RUN. Ejemplo:",
      "RUN apt-get update && apt-get install -y --no-install-recommends <paquetes> && rm -rf /var/lib/apt/lists/*",
    ].join("\n")
    : [
      "Se detectó apk add sin --no-cache.",
      "Esto deja cachés de APK dentro de la imagen, aumentando tamaño y superficie de ataque.",
      "Solución recomendada: agrega --no-cache. Ejemplo:",
      "RUN apk add --no-cache <paquetes>",
    ].join("\n");

  return {
    line: lineNum,
    kind: "missing-flag",
    severity: "medium",
    source: "internal",
    description: manager === "apt"
      ? "apt-get install sin cleanup en el mismo RUN"
      : "apk add sin --no-cache",
    original,
    replacement: null,
    remediationGuide,
  };
}

function buildConsecutiveRunIssue(lineNum: number, original: string): DockerIssue {
  const remediationGuide = [
    "Se detectaron múltiples instrucciones RUN consecutivas que podrían combinarse.",
    "Combinar RUN reduce el número de capas y puede mejorar el cache/tiempo de build.",
    "Solución recomendada: une comandos relacionados en un único RUN usando && y/o \\ para multiline.",
  ].join("\n");

  return {
    line: lineNum,
    kind: "advisory",
    severity: "low",
    source: "internal",
    description: "Múltiples RUN consecutivos combinables",
    original,
    replacement: null,
    remediationGuide,
  };
}

export function checkLayerCache(lines: string[], projectType: string): DockerIssue[] {
  const issues: DockerIssue[] = [];

  let copyAllLineNum: number | null = null;
  let copyAllOriginal: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    const lineNum = i + 1;

    if (isFromLine(trimmed)) {
      copyAllLineNum = null;
      copyAllOriginal = null;
      continue;
    }

    if (copyAllLineNum === null && isCopyAll(trimmed)) {
      copyAllLineNum = lineNum;
      copyAllOriginal = trimmed;
      continue;
    }

    if (copyAllLineNum !== null && isDepsInstall(trimmed, projectType)) {
      issues.push(buildCopyBeforeInstallIssue(copyAllLineNum, copyAllOriginal ?? "COPY . ."));
      copyAllLineNum = null;
      copyAllOriginal = null;
    }

    if (isRunLine(trimmed) && /\bapt-get\s+install\b/i.test(trimmed) && !hasAptCleanup(trimmed)) {
      issues.push(buildPackageCleanupIssue(lineNum, trimmed, "apt"));
    }

    if (isRunLine(trimmed) && /\bapk\s+add\b/i.test(trimmed) && !hasApkNoCache(trimmed)) {
      issues.push(buildPackageCleanupIssue(lineNum, trimmed, "apk"));
    }
  }

  let runStreakStart: { lineNum: number; original: string } | null = null;
  let runStreakCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (isCommentOrBlank(line)) continue;

    if (isFromLine(trimmed)) {
      runStreakStart = null;
      runStreakCount = 0;
      continue;
    }

    if (isRunLine(trimmed)) {
      if (!runStreakStart) runStreakStart = { lineNum: i + 1, original: trimmed };
      runStreakCount++;
      continue;
    }

    if (runStreakCount >= 2 && runStreakStart) {
      issues.push(buildConsecutiveRunIssue(runStreakStart.lineNum, runStreakStart.original));
    }
    runStreakStart = null;
    runStreakCount = 0;
  }

  if (runStreakCount >= 2 && runStreakStart) {
    issues.push(buildConsecutiveRunIssue(runStreakStart.lineNum, runStreakStart.original));
  }

  return issues;
}
