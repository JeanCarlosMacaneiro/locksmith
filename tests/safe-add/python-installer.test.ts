import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { bunShell } from "../../src/add/shell";

type ShellFn = typeof bunShell.$;

const capturedCommands: string[] = [];
const capturedCwds: string[] = [];

// Re-mock the module so orchestrator.test.ts mock doesn't bleed in (same pattern as installer.test.ts)
mock.module("../../src/add/python-installer", () => ({
  installPythonPackage: async (name: string, ver: string, cwd: string) => {
    await bunShell.$`poetry add ${name}@${ver}`.cwd(cwd);
  },
  updatePythonPackage: async (name: string, ver: string, cwd: string) => {
    await bunShell.$`poetry add ${name}@${ver}`.cwd(cwd);
  },
}));

import { installPythonPackage, updatePythonPackage } from "../../src/add/python-installer";

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
  };
}) as unknown as ShellFn;

const failingDollar = ((_strings: TemplateStringsArray) => ({
  cwd: (_path: string) => Promise.reject(new Error("poetry not found")),
})) as unknown as ShellFn;

const originalShell = bunShell.$;

beforeEach(() => {
  capturedCommands.length = 0;
  capturedCwds.length = 0;
  bunShell.$ = mockDollar;
});

afterEach(() => {
  bunShell.$ = originalShell;
});

describe("installPythonPackage", () => {
  it("invoca poetry add con nombre y versión", async () => {
    await installPythonPackage("requests", "2.31.0", "/proj");
    expect(capturedCommands.some((c) => c.includes("requests") && c.includes("2.31.0"))).toBe(true);
  });

  it("usa poetry add", async () => {
    await installPythonPackage("requests", "2.31.0", "/proj");
    expect(capturedCommands.some((c) => c.includes("poetry"))).toBe(true);
  });

  it("passa cwd correto", async () => {
    await installPythonPackage("requests", "2.31.0", "/my/project");
    expect(capturedCwds).toContain("/my/project");
  });

  it("error en shell → propaga excepción", async () => {
    bunShell.$ = failingDollar;
    await expect(installPythonPackage("requests", "2.31.0", "/proj")).rejects.toThrow("poetry not found");
  });
});

describe("updatePythonPackage", () => {
  it("invoca poetry add para update", async () => {
    await updatePythonPackage("requests", "2.32.0", "/proj");
    expect(capturedCommands.some((c) => c.includes("requests") && c.includes("2.32.0"))).toBe(true);
  });

  it("passa cwd correto", async () => {
    await updatePythonPackage("requests", "2.32.0", "/my/project");
    expect(capturedCwds).toContain("/my/project");
  });
});
