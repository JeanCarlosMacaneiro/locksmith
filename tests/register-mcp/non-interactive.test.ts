import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { isInteractive, main } from "../../bin/register-mcp";

const ROOT = join(import.meta.dir, "../..");

let tmpDir: string;
let origCI: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "locksmith-ni-"));
  origCI = process.env.CI;
});

afterEach(() => {
  if (origCI === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = origCI;
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Modo no interactivo", () => {
  it("isInteractive() con CI=true → false", () => {
    process.env.CI = "true";
    expect(isInteractive()).toBe(false);
  });

  it("isInteractive() con CI=1 → false", () => {
    process.env.CI = "1";
    expect(isInteractive()).toBe(false);
  });

  it("isInteractive() sin TTY → false (en entorno de test, stdin no es TTY)", () => {
    delete process.env.CI;
    const stdinAny = process.stdin as unknown as { isTTY?: boolean };
    const orig = stdinAny.isTTY;
    stdinAny.isTTY = false;
    try {
      expect(isInteractive()).toBe(false);
    } finally {
      stdinAny.isTTY = orig;
    }
  });

  it("main() con interactive=false → termina sin error, sin crear archivos", async () => {
    await main({
      interactive: false,
      scriptDir: ROOT,
      env: { HOME: tmpDir },
    });

    expect(existsSync(join(tmpDir, ".cursor/mcp.json"))).toBe(false);
    expect(existsSync(join(tmpDir, ".kiro/settings/mcp.json"))).toBe(false);
    expect(existsSync(join(tmpDir, "Library"))).toBe(false);
  });

  it("main() con CI=true (subprocess) → exit 0, sin interacción", async () => {
    const proc = Bun.spawn(["bun", join(ROOT, "bin/register-mcp.ts")], {
      env: { ...process.env, CI: "true" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  }, 15000);
});
