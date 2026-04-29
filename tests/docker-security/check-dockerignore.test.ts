import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { checkDockerignore } from "../../src/docker/check-dockerignore";
import { generateBaseDockerignore, SENSITIVE_PATTERNS } from "../../src/docker/fix-dockerignore";

describe("docker-security-layer — check-dockerignore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "locksmith-check-dockerignore-"));
    mkdirSync(join(dir, "src"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("Property 11: Ausencia de .dockerignore genera issue con replacement", () => {
    const issues = checkDockerignore(dir);
    expect(issues.length).toBeGreaterThan(0);
    const missing = issues.find((i) => i.original.startsWith(".dockerignore") && i.replacement !== null);
    expect(missing?.replacement).toBe(generateBaseDockerignore());
  });

  it("Property 12: .dockerignore incompleto genera issues por entradas faltantes", () => {
    writeFileSync(join(dir, ".dockerignore"), `${SENSITIVE_PATTERNS[0]}\n`, "utf-8");
    const issues = checkDockerignore(dir);
    const missingPatternIssues = issues.filter((i) => i.description.startsWith("Entrada faltante en .dockerignore:"));
    expect(missingPatternIssues.length).toBe(SENSITIVE_PATTERNS.length - 1);
  });

  it("no reporta faltantes cuando .dockerignore incluye todos los patrones", () => {
    writeFileSync(join(dir, ".dockerignore"), generateBaseDockerignore(), "utf-8");
    const issues = checkDockerignore(dir);
    const missingPatternIssues = issues.filter((i) => i.description.startsWith("Entrada faltante en .dockerignore:"));
    expect(missingPatternIssues.length).toBe(0);
  });
});

