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
    "Se detectó apt-get install sin cleanup en la misma capa RUN.",
    "Esto deja cachés de APT dentro de la imagen, aumentando tamaño y superficie de ataque.",
    "Solución recomendada: agrega el cleanup en el mismo RUN. Ejemplo:",
    "RUN apt-get update && apt-get install -y --no-install-recommends <paquetes> && rm -rf /var/lib/apt/lists/*",
  ].join("\n");

  return {
    line: lineNum,
    kind: "missing-flag",
    severity: "medium",
    source: "internal",
    description: "apt-get install sin cleanup (rm -rf /var/lib/apt/lists/* o apt-get clean) en el mismo RUN",
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
