import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";

import { detectProject }      from "../src/checks/detect-project";
import { checkNpmrc }         from "../src/checks/check-npmrc";
import { checkRenovate }      from "../src/checks/check-renovate";
import { checkLockfile }      from "../src/checks/check-lockfile";
import { checkBuiltDeps }     from "../src/checks/check-built-deps";
import { checkOnlyAllow }     from "../src/checks/check-only-allow";
import { checkPackageManager } from "../src/checks/check-package-manager";

import {
  applyNpmrc,
  applyRenovate,
  applyOnlyBuiltDeps,
  applyOnlyAllow,
  applyPackageManager,
} from "../src/fixer/apply";

// ─── helpers ────────────────────────────────────────────────────────────────

const TMP = "./tmp-test-project";

const BASE_PKG = { name: "test-project", version: "1.0.0" };

const VALID_NPMRC = [
  "ignore-scripts=true",
  "verify-store-integrity=true",
  "strict-ssl=true",
  "frozen-lockfile=true",
  "node-linker=isolated",
].join("\n");

const VALID_RENOVATE = {
  packageRules: [
    { matchUpdateTypes: ["patch"], minimumReleaseAge: "3 days", automerge: false },
    { matchUpdateTypes: ["minor"], minimumReleaseAge: "7 days", automerge: false },
    { matchUpdateTypes: ["major"], minimumReleaseAge: "30 days", automerge: false },
  ],
};

function writePkg(extra: object = {}) {
  writeFileSync(join(TMP, "package.json"), JSON.stringify({ ...BASE_PKG, ...extra }, null, 2));
}

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

// ─── detectProject ──────────────────────────────────────────────────────────

describe("detectProject", () => {
  it("detecta proyecto node con package.json", async () => {
    writePkg();
    const r = await detectProject(TMP);
    expect(r.valid).toBe(true);
    expect(r.type).toBe("node");
  });

  it("retorna valid=false si no hay package.json", async () => {
    const r = await detectProject(TMP);
    expect(r.valid).toBe(false);
  });
});

// ─── checkNpmrc ─────────────────────────────────────────────────────────────

describe("checkNpmrc", () => {
  it("error si .npmrc no existe — debe ser fixable", async () => {
    writePkg();
    const r = await checkNpmrc(TMP);
    expect(r.status).toBe("error");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("error si .npmrc existe pero faltan reglas — debe ser fixable", async () => {
    writePkg();
    writeFileSync(join(TMP, ".npmrc"), "ignore-scripts=true\nstrict-ssl=true");
    const r = await checkNpmrc(TMP);
    expect(r.status).toBe("error");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
    expect(r.message).toContain("Faltan reglas");
  });

  it("error si falta frozen-lockfile=true específicamente", async () => {
    writePkg();
    writeFileSync(join(TMP, ".npmrc"), [
      "ignore-scripts=true",
      "verify-store-integrity=true",
      "strict-ssl=true",
      "node-linker=isolated",
      // frozen-lockfile ausente a propósito
    ].join("\n"));
    const r = await checkNpmrc(TMP);
    expect(r.status).toBe("error");
    expect(r.message).toContain("frozen-lockfile=true");
  });

  it("ok si .npmrc tiene las 5 reglas requeridas", async () => {
    writePkg();
    writeFileSync(join(TMP, ".npmrc"), VALID_NPMRC);
    const r = await checkNpmrc(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("5/5");
  });
});

// ─── checkRenovate ──────────────────────────────────────────────────────────

describe("checkRenovate", () => {
  it("warn si renovate.json no existe — debe ser fixable con hint", async () => {
    writePkg();
    const r = await checkRenovate(TMP);
    expect(r.status).toBe("warn");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
    expect(r.hint).toBeDefined();
    expect(r.hint!.length).toBeGreaterThan(0);
  });

  it("error si release delay es insuficiente — debe tener hint", async () => {
    writePkg();
    writeFileSync(join(TMP, "renovate.json"), JSON.stringify({
      packageRules: [
        { matchUpdateTypes: ["patch"], minimumReleaseAge: "1 days" },
        { matchUpdateTypes: ["minor"], minimumReleaseAge: "2 days" },
        { matchUpdateTypes: ["major"], minimumReleaseAge: "5 days" },
      ],
    }));
    const r = await checkRenovate(TMP);
    expect(r.status).toBe("error");
    expect(r.hint).toBeDefined();
  });

  it("error si falta alguna regla de update type", async () => {
    writePkg();
    writeFileSync(join(TMP, "renovate.json"), JSON.stringify({
      packageRules: [
        { matchUpdateTypes: ["patch"], minimumReleaseAge: "3 days" },
        // minor y major ausentes
      ],
    }));
    const r = await checkRenovate(TMP);
    expect(r.status).toBe("error");
    expect(r.message).toContain("minor");
    expect(r.message).toContain("major");
  });

  it("ok con delays correctos — debe tener hint con comandos pnpm", async () => {
    writePkg();
    writeFileSync(join(TMP, "renovate.json"), JSON.stringify(VALID_RENOVATE));
    const r = await checkRenovate(TMP);
    expect(r.status).toBe("ok");
    expect(r.hint).toBeDefined();
    const hintsJoined = r.hint!.join(" ");
    expect(hintsJoined).toContain("pnpm update");
    expect(hintsJoined).toContain("pnpm add");
  });

  it("acepta renovate.json en .github/renovate.json", async () => {
    writePkg();
    mkdirSync(join(TMP, ".github"), { recursive: true });
    writeFileSync(join(TMP, ".github/renovate.json"), JSON.stringify(VALID_RENOVATE));
    const r = await checkRenovate(TMP);
    expect(r.status).toBe("ok");
  });
});

// ─── checkLockfile ──────────────────────────────────────────────────────────

describe("checkLockfile", () => {
  it("error si pnpm-lock.yaml no existe", async () => {
    writePkg();
    const r = await checkLockfile(TMP);
    expect(r.status).toBe("error");
  });

  it("warn si pnpm-lock.yaml existe pero está vacío o corrupto (< 50 bytes)", async () => {
    writePkg();
    writeFileSync(join(TMP, "pnpm-lock.yaml"), "lockfileVersion: 9");
    const r = await checkLockfile(TMP);
    expect(r.status).toBe("warn");
    expect(r.message).toContain("vacío o corrupto");
  });

  it("ok si pnpm-lock.yaml existe con contenido válido", async () => {
    writePkg();
    writeFileSync(join(TMP, "pnpm-lock.yaml"), "lockfileVersion: 9\n" + "x".repeat(100));
    const r = await checkLockfile(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("KB");
  });
});

// ─── checkBuiltDeps ─────────────────────────────────────────────────────────

describe("checkBuiltDeps", () => {
  it("warn si package.json no tiene onlyBuiltDependencies ni neverBuiltDependencies", async () => {
    writePkg();
    const r = await checkBuiltDeps(TMP);
    expect(r.status).toBe("warn");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("ok si tiene onlyBuiltDependencies (lista vacía)", async () => {
    writePkg({ pnpm: { onlyBuiltDependencies: [] } });
    const r = await checkBuiltDeps(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("onlyBuiltDependencies");
  });

  it("ok si tiene onlyBuiltDependencies con paquetes", async () => {
    writePkg({ pnpm: { onlyBuiltDependencies: ["esbuild", "sharp"] } });
    const r = await checkBuiltDeps(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("esbuild");
  });

  it("ok si tiene neverBuiltDependencies", async () => {
    writePkg({ pnpm: { neverBuiltDependencies: ["malicious-pkg"] } });
    const r = await checkBuiltDeps(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("neverBuiltDependencies");
  });

  it("warn si package.json no existe", async () => {
    const r = await checkBuiltDeps(TMP);
    expect(r.status).toBe("warn");
  });
});

// ─── checkOnlyAllow ─────────────────────────────────────────────────────────

describe("checkOnlyAllow", () => {
  it("warn si no hay scripts.preinstall", async () => {
    writePkg();
    const r = await checkOnlyAllow(TMP);
    expect(r.status).toBe("warn");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("warn si preinstall existe pero no contiene only-allow pnpm", async () => {
    writePkg({ scripts: { preinstall: "echo hello" } });
    const r = await checkOnlyAllow(TMP);
    expect(r.status).toBe("warn");
  });

  it("ok si preinstall contiene only-allow pnpm", async () => {
    writePkg({ scripts: { preinstall: "npx only-allow pnpm" } });
    const r = await checkOnlyAllow(TMP);
    expect(r.status).toBe("ok");
  });

  it("warn si package.json no existe", async () => {
    const r = await checkOnlyAllow(TMP);
    expect(r.status).toBe("warn");
  });
});

// ─── checkPackageManager ────────────────────────────────────────────────────

describe("checkPackageManager", () => {
  it("warn si campo packageManager está ausente — debe ser fixable", async () => {
    writePkg();
    const r = await checkPackageManager(TMP);
    expect(r.status).toBe("warn");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("error si formato es inválido (sin versión) — debe ser fixable", async () => {
    writePkg({ packageManager: "pnpm" });
    const r = await checkPackageManager(TMP);
    expect(r.status).toBe("error");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("error si formato es inválido (versión incompleta)", async () => {
    writePkg({ packageManager: "pnpm@10" });
    const r = await checkPackageManager(TMP);
    expect(r.status).toBe("error");
  });

  it("error si packageManager no es pnpm", async () => {
    writePkg({ packageManager: "npm@10.0.0" });
    const r = await checkPackageManager(TMP);
    expect(r.status).toBe("error");
    expect(r.message).toContain("npm@10.0.0");
  });

  it("ok si formato es correcto pnpm@X.Y.Z", async () => {
    writePkg({ packageManager: "pnpm@10.25.0" });
    const r = await checkPackageManager(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("pnpm@10.25.0");
  });

  it("warn si package.json no existe", async () => {
    const r = await checkPackageManager(TMP);
    expect(r.status).toBe("warn");
  });
});

// ─── fixers ─────────────────────────────────────────────────────────────────

describe("applyNpmrc", () => {
  it("crea .npmrc con las 5 reglas requeridas", async () => {
    writePkg();
    await applyNpmrc(TMP);
    const content = readFileSync(join(TMP, ".npmrc"), "utf-8");
    expect(content).toContain("ignore-scripts=true");
    expect(content).toContain("verify-store-integrity=true");
    expect(content).toContain("strict-ssl=true");
    expect(content).toContain("frozen-lockfile=true");
    expect(content).toContain("node-linker=isolated");
  });
});

describe("applyRenovate", () => {
  it("crea renovate.json con delays correctos y automerge false", async () => {
    writePkg();
    await applyRenovate(TMP);
    const content = JSON.parse(readFileSync(join(TMP, "renovate.json"), "utf-8"));
    const patch = content.packageRules.find((r: any) => r.matchUpdateTypes?.includes("patch"));
    const minor = content.packageRules.find((r: any) => r.matchUpdateTypes?.includes("minor"));
    const major = content.packageRules.find((r: any) => r.matchUpdateTypes?.includes("major"));
    expect(patch.minimumReleaseAge).toBe("3 days");
    expect(patch.automerge).toBe(false);
    expect(minor.minimumReleaseAge).toBe("7 days");
    expect(minor.automerge).toBe(false);
    expect(major.minimumReleaseAge).toBe("30 days");
    expect(major.automerge).toBe(false);
  });
});

describe("applyOnlyBuiltDeps", () => {
  it("agrega pnpm.onlyBuiltDependencies al package.json", async () => {
    writePkg();
    await applyOnlyBuiltDeps(TMP);
    const pkg = JSON.parse(readFileSync(join(TMP, "package.json"), "utf-8"));
    expect(Array.isArray(pkg.pnpm.onlyBuiltDependencies)).toBe(true);
  });

  it("preserva campos existentes del package.json", async () => {
    writePkg({ pnpm: { otherField: true } });
    await applyOnlyBuiltDeps(TMP);
    const pkg = JSON.parse(readFileSync(join(TMP, "package.json"), "utf-8"));
    expect(pkg.pnpm.otherField).toBe(true);
    expect(Array.isArray(pkg.pnpm.onlyBuiltDependencies)).toBe(true);
  });
});

describe("applyOnlyAllow", () => {
  it("agrega scripts.preinstall con only-allow pnpm", async () => {
    writePkg();
    await applyOnlyAllow(TMP);
    const pkg = JSON.parse(readFileSync(join(TMP, "package.json"), "utf-8"));
    expect(pkg.scripts.preinstall).toBe("npx only-allow pnpm");
  });

  it("preserva scripts existentes del package.json", async () => {
    writePkg({ scripts: { build: "tsc", test: "bun test" } });
    await applyOnlyAllow(TMP);
    const pkg = JSON.parse(readFileSync(join(TMP, "package.json"), "utf-8"));
    expect(pkg.scripts.build).toBe("tsc");
    expect(pkg.scripts.test).toBe("bun test");
    expect(pkg.scripts.preinstall).toBe("npx only-allow pnpm");
  });
});

describe("applyPackageManager", () => {
  it("escribe packageManager con versión de pnpm instalada", async () => {
    writePkg();
    await applyPackageManager(TMP);
    const pkg = JSON.parse(readFileSync(join(TMP, "package.json"), "utf-8"));
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });

  it("sobreescribe packageManager si ya existe con formato inválido", async () => {
    writePkg({ packageManager: "pnpm" });
    await applyPackageManager(TMP);
    const pkg = JSON.parse(readFileSync(join(TMP, "package.json"), "utf-8"));
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });
});
