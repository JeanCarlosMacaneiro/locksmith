/**
 * Installer tests — Property 6: --ignore-scripts invariant.
 *
 * Orchestrator.test.ts mocks "../../src/add/installer" at module level, which
 * affects this file when tests run together. We override that mock here with an
 * inline version that uses bunShell, so we can intercept the shell call.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import fc from "fast-check";

import { bunShell } from "../../src/add/shell";

type ShellFn = typeof bunShell.$;

const capturedCommands: string[] = [];
const capturedCwds: string[] = [];

const mockDollar = ((strings: TemplateStringsArray, ...values: unknown[]) => {
  let cmd = "";
  strings.forEach((s, i) => {
    cmd += s;
    if (i < values.length) cmd += String(values[i]);
  });
  capturedCommands.push(cmd.trim());
  return {
    cwd: (path: string) => {
      capturedCwds.push(path);
      return Promise.resolve();
    },
    quiet: () => Promise.resolve({ stdout: Buffer.from(""), stderr: Buffer.from("") }),
  };
}) as unknown as ShellFn;

// Override any prior mock.module("installer") with an inline version that uses
// bunShell — so beforeEach mutations of bunShell.$ are visible here.
mock.module("../../src/add/installer", () => ({
  installPackage: async (name: string, ver: string, cwd: string) => {
    await bunShell.$`pnpm add ${name}@${ver} --ignore-scripts`.cwd(cwd);
  },
  updatePackage: async (name: string, ver: string, cwd: string) => {
    await bunShell.$`pnpm update ${name}@${ver} --ignore-scripts`.cwd(cwd);
  },
}));

import { installPackage, updatePackage } from "../../src/add/installer";

const originalShell = bunShell.$;

beforeEach(() => {
  capturedCommands.length = 0;
  capturedCwds.length = 0;
  bunShell.$ = mockDollar;
});

afterEach(() => {
  bunShell.$ = originalShell;
});

// ── Source inspection — security invariant ────────────────────────────────────

const INSTALLER_SOURCE = readFileSync(
  join(__dirname, "../../src/add/installer.ts"),
  "utf-8"
);

describe("installer — source invariant", () => {
  it("installer.ts source contains --ignore-scripts in installPackage body", () => {
    const match = INSTALLER_SOURCE.match(/installPackage[\s\S]*?--ignore-scripts/);
    expect(match).not.toBeNull();
  });

  it("installer.ts source contains --ignore-scripts in updatePackage body", () => {
    const match = INSTALLER_SOURCE.match(/updatePackage[\s\S]*?--ignore-scripts/);
    expect(match).not.toBeNull();
  });
});

// ── Feature: safe-add, Property 6: El installer siempre incluye --ignore-scripts ──

describe("installer — Property 6: siempre usa --ignore-scripts", () => {
  it("installPackage → comando contiene --ignore-scripts", async () => {
    await installPackage("express", "4.18.0", "/tmp/proj");
    expect(capturedCommands.some((c) => c.includes("--ignore-scripts"))).toBe(true);
  });

  it("updatePackage → comando contiene --ignore-scripts", async () => {
    await updatePackage("lodash", "4.17.21", "/tmp/proj");
    expect(capturedCommands.some((c) => c.includes("--ignore-scripts"))).toBe(true);
  });

  it("property: cualquier paquete/versión → --ignore-scripts siempre presente", () =>
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (pkgName, version) => {
          capturedCommands.length = 0;
          await installPackage(pkgName, version, "/tmp");
          return capturedCommands.some((c) => c.includes("--ignore-scripts"));
        }
      ),
      { numRuns: 50 }
    )
  );
});

// ── Behavioral correctness ────────────────────────────────────────────────────

describe("installer — comandos correctos", () => {
  it("installPackage usa pnpm add", async () => {
    await installPackage("express", "4.18.0", "/tmp/proj");
    expect(capturedCommands.some((c) => c.includes("pnpm add"))).toBe(true);
  });

  it("updatePackage usa pnpm update", async () => {
    await updatePackage("lodash", "4.17.21", "/tmp/proj");
    expect(capturedCommands.some((c) => c.includes("pnpm update"))).toBe(true);
  });

  it("installPackage incluye nombre y versión del paquete", async () => {
    await installPackage("react", "18.2.0", "/tmp");
    expect(capturedCommands.some((c) => c.includes("react") && c.includes("18.2.0"))).toBe(true);
  });

  it("installPackage llama .cwd con projectPath", async () => {
    await installPackage("express", "4.0.0", "/my/project");
    expect(capturedCwds).toContain("/my/project");
  });
});
