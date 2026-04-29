import { describe, it, expect, mock, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { RunOptions } from "../src/types";

// ── Module mocks — ONLY modules not imported by checks.test.ts ────────────────
//
// NOT mocked: detect-project, check-npmrc, check-lockfile, check-renovate,
//   check-built-deps, check-only-allow, check-package-manager, check-node-version,
//   check-secrets, check-gitignore, check-scripts, fixer/apply
//   (all imported by checks.test.ts — mocking them leaks across test files)
//
// check-audit mocked because pnpm audit requires node_modules installed.
// check-pnpm NOT mocked — pnpm is installed on this system, returns "ok".

const mockShowDockerWarnings = mock(async (..._args: unknown[]) => {});
const mockPromptDockerFix    = mock(async (..._args: unknown[]) => {});

mock.module("../src/checks/check-audit", () => ({
  checkAudit: mock(async () => ({ name: "pnpm audit", status: "ok" as const, message: "ok" })),
}));

mock.module("../src/docker/prompt-dockerfile", () => ({
  showDockerWarnings: mockShowDockerWarnings,
  promptDockerFix:    mockPromptDockerFix,
}));

// analyze-dockerfile NOT mocked — checks.test.ts imports it.
// Real analyzeDockerfile returns [{found:false}] when no Dockerfile in temp dir, which is fine.

mock.module("../src/outdated/index",   () => ({ runOutdated:  mock(async () => {}) }));

import { runAllChecks } from "../src/checks/index";

// Restore all module mocks after this file so they don't leak into other test files.
afterAll(() => { mock.restore(); });

// Suppress printReport/exportReport terminal noise — these tests check behavior, not output.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let consoleSpy: any;
beforeEach(() => { consoleSpy = spyOn(console, "log").mockImplementation(() => {}); });
afterEach(() => { consoleSpy.mockRestore(); });

// ── Valid project template (makes all real checks return "ok") ────────────────

const VALID_NPMRC = [
  "ignore-scripts=true",
  "verify-store-integrity=true",
  "strict-ssl=true",
  "frozen-lockfile=true",
  "node-linker=isolated",
].join("\n");

const VALID_RENOVATE = JSON.stringify({
  packageRules: [
    { matchUpdateTypes: ["patch"], minimumReleaseAge: "3 days", automerge: false },
    { matchUpdateTypes: ["minor"], minimumReleaseAge: "7 days", automerge: false },
    { matchUpdateTypes: ["major"], minimumReleaseAge: "30 days", automerge: false },
  ],
}, null, 2);

const VALID_PKG = JSON.stringify({
  name: "test-orchestrator",
  version: "1.0.0",
  packageManager: "pnpm@10.25.0",
  scripts: {
    preinstall: "npx only-allow pnpm",
    ci: "pnpm install --frozen-lockfile",
    security: "locksmith",
  },
  pnpm: { onlyBuiltDependencies: [] },
}, null, 2);

// checkLockfile requires pnpm-lock.yaml > 50 bytes
const VALID_LOCKFILE =
  "lockfileVersion: '9.0'\npackages: {}\nsnapshots: {}\n# minimal lockfile for test (>50 bytes pad)\n";

const VALID_GITIGNORE = ".env\n*.pem\n*.key\nnode_modules/\n";

function createValidProject(dir: string): void {
  writeFileSync(join(dir, "package.json"),   VALID_PKG);
  writeFileSync(join(dir, ".npmrc"),          VALID_NPMRC);
  writeFileSync(join(dir, "pnpm-lock.yaml"), VALID_LOCKFILE);
  writeFileSync(join(dir, "renovate.json"),  VALID_RENOVATE);
  writeFileSync(join(dir, ".gitignore"),     VALID_GITIGNORE);
  writeFileSync(join(dir, ".node-version"),  "20\n");
}

// ── Helper: run runAllChecks, capture exit code ───────────────────────────────

async function runSafely(opts: RunOptions): Promise<number> {
  let capturedCode = -1;
  const exitSpy = spyOn(process, "exit").mockImplementation((code?: number | string) => {
    capturedCode = typeof code === "number" ? code : 0;
    throw new Error(`__EXIT_${capturedCode}`);
  });
  try {
    await runAllChecks(opts);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("__EXIT_")) throw e;
  } finally {
    exitSpy.mockRestore();
  }
  return capturedCode;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Orchestrator — modos de operación Docker", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "locksmith-orch-"));
    mockShowDockerWarnings.mockClear();
    mockPromptDockerFix.mockClear();
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // ── Audit_Mode ──────────────────────────────────────────────────────────────

  describe("Audit_Mode (sin flags de fix)", () => {
    it("invoca showDockerWarnings y no promptDockerFix", async () => {
      createValidProject(dir);
      await runSafely({ projectPath: dir, fix: false, fixDockerfile: false, fixDocker: false, strict: false, outdated: false });
      expect(mockShowDockerWarnings).toHaveBeenCalled();
      expect(mockPromptDockerFix).not.toHaveBeenCalled();
    });

    it("sale con código 0 cuando todos los checks pasan", async () => {
      createValidProject(dir);
      const code = await runSafely({ projectPath: dir, fix: false, fixDockerfile: false, fixDocker: false, strict: false, outdated: false });
      expect(code).toBe(0);
    });
  });

  // ── Fix_Mode ─────────────────────────────────────────────────────────────────

  describe("Fix_Mode (--fix)", () => {
    it("invoca promptDockerFix con autoFix=false", async () => {
      createValidProject(dir);
      await runSafely({ projectPath: dir, fix: true, fixDockerfile: false, fixDocker: false, strict: false, outdated: false });
      expect(mockPromptDockerFix).toHaveBeenCalled();
      // third argument to promptDockerFix is autoFix
      expect(mockPromptDockerFix.mock.calls[0]?.[2]).toBe(false);
    });

    it("no invoca showDockerWarnings", async () => {
      createValidProject(dir);
      await runSafely({ projectPath: dir, fix: true, fixDockerfile: false, fixDocker: false, strict: false, outdated: false });
      expect(mockShowDockerWarnings).not.toHaveBeenCalled();
    });
  });

  // ── Dockerfile_Fix_Mode ───────────────────────────────────────────────────────

  describe("Dockerfile_Fix_Mode (--fix-dockerfile sin --fix)", () => {
    it("invoca promptDockerFix con autoFix=true", async () => {
      createValidProject(dir);
      await runSafely({ projectPath: dir, fix: false, fixDockerfile: true, fixDocker: false, strict: false, outdated: false });
      expect(mockPromptDockerFix).toHaveBeenCalled();
      // third argument to promptDockerFix is autoFix
      expect(mockPromptDockerFix.mock.calls[0]?.[2]).toBe(true);
    });

    it("no invoca showDockerWarnings", async () => {
      createValidProject(dir);
      await runSafely({ projectPath: dir, fix: false, fixDockerfile: true, fixDocker: false, strict: false, outdated: false });
      expect(mockShowDockerWarnings).not.toHaveBeenCalled();
    });

    it("omite Security_Checks — exit 0 incluso con proyecto sin .npmrc ni lockfile", async () => {
      // Broken project: only package.json, no .npmrc, no lockfile, no renovate.
      // If security checks ran they'd return errors → exit 1.
      // Dockerfile_Fix_Mode skips them → exit 0.
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "broken", version: "1.0.0" }));
      const code = await runSafely({ projectPath: dir, fix: false, fixDockerfile: true, fixDocker: false, strict: false, outdated: false });
      expect(code).toBe(0);
    });

    it("sale con código 0", async () => {
      createValidProject(dir);
      const code = await runSafely({ projectPath: dir, fix: false, fixDockerfile: true, fixDocker: false, strict: false, outdated: false });
      expect(code).toBe(0);
    });
  });

  describe("Dockerfile_Fix_Mode (--fix-docker sin --fix)", () => {
    it("invoca promptDockerFix con autoFix=true", async () => {
      createValidProject(dir);
      await runSafely({ projectPath: dir, fix: false, fixDockerfile: false, fixDocker: true, strict: false, outdated: false });
      expect(mockPromptDockerFix).toHaveBeenCalled();
      expect(mockPromptDockerFix.mock.calls[0]?.[2]).toBe(true);
    });
  });
});
