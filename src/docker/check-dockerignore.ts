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
    "Falta una entrada crítica en .dockerignore.",
    "Sin esa exclusión, archivos sensibles pueden incluirse accidentalmente en el contexto de build y terminar dentro de la imagen.",
    "Agrega esta línea al final de tu .dockerignore:",
    replacement,
  ].join("\n");

  return {
    line: 1,
    kind: "missing-copy",
    severity: "medium",
    source: "internal",
    description: `Entrada faltante en .dockerignore: ${normalizeDockerignoreLine(pattern)}`,
    original: ".dockerignore",
    replacement,
    remediationGuide,
  };
}

function buildMissingDockerignoreIssue(): DockerIssue {
  const replacement = generateBaseDockerignore();
  const remediationGuide = [
    "No existe un archivo .dockerignore en el proyecto.",
    "Sin .dockerignore, Docker puede copiar credenciales, archivos de entorno y otros artefactos al contexto de build.",
    "Crea un .dockerignore base seguro con este contenido:",
    replacement.trimEnd(),
  ].join("\n");

  return {
    line: 1,
    kind: "missing-copy",
    severity: "medium",
    source: "internal",
    description: "Falta .dockerignore — agrega exclusiones de archivos sensibles",
    original: ".dockerignore (missing)",
    replacement,
    remediationGuide,
  };
}

function buildExposedSensitiveFileIssue(relPath: string): DockerIssue {
  const replacement = relPath.split("\\").join("/");
  const remediationGuide = [
    "Se detectó un archivo sensible en el proyecto que no está cubierto por .dockerignore.",
    "Si Docker copia este archivo al contexto de build, puede terminar en la imagen o filtrarse en capas/cachés.",
    "Agrega esta línea a .dockerignore para excluirlo:",
    replacement,
  ].join("\n");

  return {
    line: 1,
    kind: "missing-copy",
    severity: "high",
    source: "internal",
    description: `Archivo sensible no ignorado por .dockerignore: ${replacement}`,
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
