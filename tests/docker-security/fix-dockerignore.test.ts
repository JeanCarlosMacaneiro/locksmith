import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import fc from "fast-check";
import { applyDockerignoreFix, generateBaseDockerignore, SENSITIVE_PATTERNS } from "../../src/docker/fix-dockerignore";

const PBT_CONFIG = { numRuns: 100 };

describe("docker-security-layer — fix-dockerignore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "locksmith-dockerignore-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("crea .dockerignore desde cero con contenido base", () => {
    const path = join(dir, ".dockerignore");
    expect(existsSync(path)).toBe(false);
    applyDockerignoreFix(dir, []);
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toBe(generateBaseDockerignore());
  });

  it("append de entradas faltantes sin modificar contenido previo", () => {
    const path = join(dir, ".dockerignore");
    writeFileSync(path, "# existing\nnode_modules\n", "utf-8");
    applyDockerignoreFix(dir, [".env", "*.pem"]);
    const content = readFileSync(path, "utf-8");
    expect(content.startsWith("# existing\nnode_modules\n")).toBe(true);
    expect(content).toContain(".env");
    expect(content).toContain("*.pem");
  });

  it("Property 13: Fix de .dockerignore preserva contenido existente", () => {
    fc.assert(
      fc.property(fc.string(), fc.subarray(SENSITIVE_PATTERNS as unknown as string[], { maxLength: 10 }), (existing, subset) => {
        const path = join(dir, ".dockerignore");
        writeFileSync(path, existing, "utf-8");
        applyDockerignoreFix(dir, subset);
        const after = readFileSync(path, "utf-8");
        expect(after.startsWith(existing)).toBe(true);
      }),
      PBT_CONFIG,
    );
  });
});

