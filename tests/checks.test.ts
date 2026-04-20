import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";

import {
  classifyUpdateType,
  calcAgeInDays,
  isPolicyMet,
  readRenovatePolicy,
  buildOutdatedPackage,
} from "../src/outdated/classify";

import { detectProject }      from "../src/checks/detect-project";
import { checkNpmrc }         from "../src/checks/check-npmrc";
import { checkRenovate }      from "../src/checks/check-renovate";
import { checkLockfile }      from "../src/checks/check-lockfile";
import { checkBuiltDeps }     from "../src/checks/check-built-deps";
import { checkOnlyAllow }     from "../src/checks/check-only-allow";
import { checkPackageManager } from "../src/checks/check-package-manager";

import { checkPyproject }     from "../src/checks/python/check-pyproject";
import { checkPoetryToml }    from "../src/checks/python/check-poetry-toml";
import { checkPoetryLock }    from "../src/checks/python/check-poetry-lock";
import { checkDepGroups }     from "../src/checks/python/check-dep-groups";
import { checkPythonVersion } from "../src/checks/python/check-python-version";
import { checkPypiSource }    from "../src/checks/python/check-pypi-source";

import { checkSecrets }      from "../src/checks/check-secrets";
import { checkGitignore }    from "../src/checks/check-gitignore";
import { checkNodeVersion }  from "../src/checks/check-node-version";

import {
  applyGitignore,
  applyNodeVersion,
  applyNpmrc,
  applyRenovate,
  applyOnlyBuiltDeps,
  applyOnlyAllow,
  applyPackageManager,
  applyPoetryToml,
  applyPythonVersion,
  applyPypiSource,
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

// ═══════════════════════════════════════════════════════════════════════════════
// PYTHON
// ═══════════════════════════════════════════════════════════════════════════════

// ─── helpers Python ──────────────────────────────────────────────────────────

const VALID_PYPROJECT = `\
[tool.poetry]
name = "test-project"
version = "1.0.0"
description = ""

[tool.poetry.dependencies]
python = ">=3.12"
requests = "^2.31"

[tool.poetry.group.dev.dependencies]
pytest = "^7.0"
`;

const PYPROJECT_NO_DEV = `\
[tool.poetry]
name = "test-project"
version = "1.0.0"
description = ""

[tool.poetry.dependencies]
python = ">=3.12"
requests = "^2.31"
`;

function writePyproject(content: string = VALID_PYPROJECT) {
  writeFileSync(join(TMP, "pyproject.toml"), content);
}

// ─── detectProject — Python ──────────────────────────────────────────────────

describe("detectProject — Python", () => {
  it("detecta proyecto python con solo pyproject.toml", async () => {
    writePyproject();
    const r = await detectProject(TMP);
    expect(r.valid).toBe(true);
    expect(r.type).toBe("python");
  });

  it("extrae name y version del pyproject.toml", async () => {
    writePyproject();
    const r = await detectProject(TMP);
    expect(r.name).toBe("test-project");
    expect(r.version).toBe("1.0.0");
  });

  it("prefiere node cuando existen package.json y pyproject.toml", async () => {
    writePkg();
    writePyproject();
    const r = await detectProject(TMP);
    expect(r.type).toBe("node");
  });
});

// ─── checkPyproject ──────────────────────────────────────────────────────────

describe("checkPyproject", () => {
  it("error si pyproject.toml no existe — debe ser fixable", async () => {
    const r = await checkPyproject(TMP);
    expect(r.status).toBe("error");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("error si falta sección [tool.poetry]", async () => {
    writePyproject(`python = ">=3.12"\n`);
    const r = await checkPyproject(TMP);
    expect(r.status).toBe("error");
    expect(r.message).toContain("[tool.poetry]");
  });

  it("error si falta campo python en dependencies", async () => {
    writePyproject(`[tool.poetry]\nname = "x"\n\n[tool.poetry.dependencies]\nrequests = "^2"\n`);
    const r = await checkPyproject(TMP);
    expect(r.status).toBe("error");
    expect(r.message).toContain("requires-python");
  });

  it("error si python version es menor a 3.12", async () => {
    writePyproject(`[tool.poetry]\nname = "x"\n\n[tool.poetry.dependencies]\npython = ">=3.10"\n`);
    const r = await checkPyproject(TMP);
    expect(r.status).toBe("error");
    expect(r.message).toContain("3.10");
  });

  it("ok si pyproject.toml es válido con python >=3.12", async () => {
    writePyproject(VALID_PYPROJECT);
    const r = await checkPyproject(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain(">=3.12");
  });
});

// ─── checkPoetryToml ─────────────────────────────────────────────────────────

describe("checkPoetryToml", () => {
  it("warn si poetry.toml no existe — debe ser fixable", async () => {
    const r = await checkPoetryToml(TMP);
    expect(r.status).toBe("warn");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("warn si poetry.toml existe pero in-project no está habilitado", async () => {
    writeFileSync(join(TMP, "poetry.toml"), "[virtualenvs]\nin-project = false\n");
    const r = await checkPoetryToml(TMP);
    expect(r.status).toBe("warn");
    expect(r.message).toContain("in-project");
  });

  it("warn si poetry.toml existe pero no tiene clave in-project", async () => {
    writeFileSync(join(TMP, "poetry.toml"), "[virtualenvs]\nprefer-active-python = true\n");
    const r = await checkPoetryToml(TMP);
    expect(r.status).toBe("warn");
  });

  it("ok si poetry.toml tiene in-project = true", async () => {
    writeFileSync(join(TMP, "poetry.toml"), "[virtualenvs]\nin-project = true\n");
    const r = await checkPoetryToml(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("in-project: true");
  });
});

// ─── checkPoetryLock ─────────────────────────────────────────────────────────

describe("checkPoetryLock", () => {
  it("error si poetry.lock no existe — debe ser fixable", async () => {
    const r = await checkPoetryLock(TMP);
    expect(r.status).toBe("error");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("error menciona archivos conflictivos cuando existen requirements.txt o Pipfile", async () => {
    writeFileSync(join(TMP, "requirements.txt"), "requests==2.31\n");
    writeFileSync(join(TMP, "Pipfile"), "[packages]\n");
    const r = await checkPoetryLock(TMP);
    expect(r.status).toBe("error");
    expect(r.message).toContain("requirements.txt");
    expect(r.message).toContain("Pipfile");
  });

  it("warn si poetry.lock existe pero está vacío o corrupto (< 50 bytes)", async () => {
    writeFileSync(join(TMP, "poetry.lock"), "# empty\n");
    const r = await checkPoetryLock(TMP);
    expect(r.status).toBe("warn");
    expect(r.message).toContain("vacío o corrupto");
  });

  it("ok si poetry.lock existe con contenido válido", async () => {
    writeFileSync(join(TMP, "poetry.lock"), "# poetry.lock\n" + "x".repeat(100));
    const r = await checkPoetryLock(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("KB");
  });
});

// ─── checkDepGroups ──────────────────────────────────────────────────────────

describe("checkDepGroups", () => {
  it("warn si pyproject.toml no existe", async () => {
    const r = await checkDepGroups(TMP);
    expect(r.status).toBe("warn");
    expect(r.message).toContain("pyproject.toml no encontrado");
  });

  it("warn si no hay grupo dev — debe ser fixable", async () => {
    writePyproject(PYPROJECT_NO_DEV);
    const r = await checkDepGroups(TMP);
    expect(r.status).toBe("warn");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
    expect(r.message).toContain("dev");
  });

  it("warn si paquetes dev están en dependencias de producción", async () => {
    writePyproject(`\
[tool.poetry]
name = "x"
version = "1.0.0"

[tool.poetry.dependencies]
python = ">=3.12"
pytest = "^7.0"

[tool.poetry.group.dev.dependencies]
black = "^23.0"
`);
    const r = await checkDepGroups(TMP);
    expect(r.status).toBe("warn");
    expect(r.message).toContain("pytest");
  });

  it("ok si tiene grupo dev y prod correctamente separados", async () => {
    writePyproject(VALID_PYPROJECT);
    const r = await checkDepGroups(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("dev:");
    expect(r.message).toContain("prod:");
  });
});

// ─── checkPythonVersion ──────────────────────────────────────────────────────

describe("checkPythonVersion", () => {
  it("warn si .python-version no existe — debe ser fixable", async () => {
    const r = await checkPythonVersion(TMP);
    expect(r.status).toBe("warn");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("error si versión es menor a 3.12 — debe ser fixable", async () => {
    writeFileSync(join(TMP, ".python-version"), "3.10.14\n");
    const r = await checkPythonVersion(TMP);
    expect(r.status).toBe("error");
    expect(r.fixable).toBe(true);
    expect(r.message).toContain("3.10.14");
  });

  it("error si versión es 3.11", async () => {
    writeFileSync(join(TMP, ".python-version"), "3.11.9\n");
    const r = await checkPythonVersion(TMP);
    expect(r.status).toBe("error");
  });

  it("ok si versión es exactamente 3.12.7", async () => {
    writeFileSync(join(TMP, ".python-version"), "3.12.7\n");
    const r = await checkPythonVersion(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("3.12.7");
  });

  it("ok si versión es mayor a 3.12 (ej: 3.13.0)", async () => {
    writeFileSync(join(TMP, ".python-version"), "3.13.0\n");
    const r = await checkPythonVersion(TMP);
    expect(r.status).toBe("ok");
  });
});

// ─── checkPypiSource ─────────────────────────────────────────────────────────

describe("checkPypiSource", () => {
  it("warn si pyproject.toml no existe", async () => {
    const r = await checkPypiSource(TMP);
    expect(r.status).toBe("warn");
    expect(r.message).toContain("pyproject.toml no encontrado");
  });

  it("ok si no hay secciones [[tool.poetry.source]] (usa PyPI por defecto)", async () => {
    writePyproject(VALID_PYPROJECT);
    const r = await checkPypiSource(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("pypi.org");
  });

  it("ok si la única fuente declarada es PyPI oficial", async () => {
    writePyproject(VALID_PYPROJECT + `\n[[tool.poetry.source]]\nname = "pypi"\nurl = "https://pypi.org/simple/"\n`);
    const r = await checkPypiSource(TMP);
    expect(r.status).toBe("ok");
  });

  it("error si hay una fuente no oficial — debe ser fixable", async () => {
    writePyproject(VALID_PYPROJECT + `\n[[tool.poetry.source]]\nname = "internal"\nurl = "https://nexus.internal/pypi/simple/"\n`);
    const r = await checkPypiSource(TMP);
    expect(r.status).toBe("error");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
    expect(r.message).toContain("internal");
  });

  it("error si hay múltiples fuentes y alguna no es oficial", async () => {
    writePyproject(VALID_PYPROJECT + `
[[tool.poetry.source]]
name = "pypi"
url = "https://pypi.org/simple/"

[[tool.poetry.source]]
name = "evil"
url = "https://evil.example.com/simple/"
`);
    const r = await checkPypiSource(TMP);
    expect(r.status).toBe("error");
    expect(r.message).toContain("evil");
  });
});

// ─── fixers Python ───────────────────────────────────────────────────────────

describe("applyPoetryToml", () => {
  it("crea poetry.toml con in-project = true", async () => {
    await applyPoetryToml(TMP);
    const content = readFileSync(join(TMP, "poetry.toml"), "utf-8");
    expect(content).toContain("in-project = true");
  });

  it("después del fix checkPoetryToml retorna ok", async () => {
    await applyPoetryToml(TMP);
    const r = await checkPoetryToml(TMP);
    expect(r.status).toBe("ok");
  });
});

describe("applyPythonVersion", () => {
  it("crea .python-version con 3.12.7", async () => {
    await applyPythonVersion(TMP);
    const content = readFileSync(join(TMP, ".python-version"), "utf-8").trim();
    expect(content).toBe("3.12.7");
  });

  it("después del fix checkPythonVersion retorna ok", async () => {
    await applyPythonVersion(TMP);
    const r = await checkPythonVersion(TMP);
    expect(r.status).toBe("ok");
  });

  it("sobreescribe .python-version si ya existe con versión vieja", async () => {
    writeFileSync(join(TMP, ".python-version"), "3.10.14\n");
    await applyPythonVersion(TMP);
    const content = readFileSync(join(TMP, ".python-version"), "utf-8").trim();
    expect(content).toBe("3.12.7");
  });
});

describe("applyPypiSource", () => {
  it("elimina fuentes no oficiales del pyproject.toml", async () => {
    writePyproject(VALID_PYPROJECT + `\n[[tool.poetry.source]]\nname = "evil"\nurl = "https://evil.example.com/simple/"\n`);
    await applyPypiSource(TMP);
    const content = readFileSync(join(TMP, "pyproject.toml"), "utf-8");
    expect(content).not.toContain("evil.example.com");
  });

  it("conserva fuente oficial PyPI si estaba declarada", async () => {
    writePyproject(VALID_PYPROJECT + `\n[[tool.poetry.source]]\nname = "pypi"\nurl = "https://pypi.org/simple/"\n`);
    await applyPypiSource(TMP);
    const content = readFileSync(join(TMP, "pyproject.toml"), "utf-8");
    expect(content).toContain("https://pypi.org/simple/");
  });

  it("después del fix checkPypiSource retorna ok", async () => {
    writePyproject(VALID_PYPROJECT + `\n[[tool.poetry.source]]\nname = "evil"\nurl = "https://evil.example.com/simple/"\n`);
    await applyPypiSource(TMP);
    const r = await checkPypiSource(TMP);
    expect(r.status).toBe("ok");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OUTDATED — classify.ts
// ═══════════════════════════════════════════════════════════════════════════════

// ─── classifyUpdateType ──────────────────────────────────────────────────────

describe("classifyUpdateType", () => {
  it("patch: solo cambia el tercer número", () => {
    expect(classifyUpdateType("1.2.3", "1.2.4")).toBe("patch");
  });

  it("patch: números iguales", () => {
    expect(classifyUpdateType("1.0.0", "1.0.1")).toBe("patch");
  });

  it("minor: cambia el segundo número", () => {
    expect(classifyUpdateType("1.2.3", "1.3.0")).toBe("minor");
  });

  it("minor: minor mayor, patch diferente", () => {
    expect(classifyUpdateType("17.7.2", "18.0.0")).toBe("major");
  });

  it("major: cambia el primer número", () => {
    expect(classifyUpdateType("5.9.3", "6.0.2")).toBe("major");
  });

  it("major: de 1.x a 2.x", () => {
    expect(classifyUpdateType("1.0.0", "2.0.0")).toBe("major");
  });
});

// ─── calcAgeInDays ───────────────────────────────────────────────────────────

describe("calcAgeInDays", () => {
  it("retorna 0 para una fecha de hoy", () => {
    const now = new Date();
    expect(calcAgeInDays(now)).toBe(0);
  });

  it("retorna 1 para una fecha de ayer", () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    expect(calcAgeInDays(yesterday)).toBe(1);
  });

  it("retorna 7 para hace una semana", () => {
    const lastWeek = new Date(Date.now() - 7 * 86_400_000);
    expect(calcAgeInDays(lastWeek)).toBe(7);
  });

  it("retorna 30 para hace un mes", () => {
    const lastMonth = new Date(Date.now() - 30 * 86_400_000);
    expect(calcAgeInDays(lastMonth)).toBe(30);
  });
});

// ─── isPolicyMet ─────────────────────────────────────────────────────────────

describe("isPolicyMet", () => {
  it("true cuando la edad supera el mínimo de días", () => {
    expect(isPolicyMet(5, 3)).toBe(true);
  });

  it("true cuando la edad es exactamente el mínimo", () => {
    expect(isPolicyMet(3, 3)).toBe(true);
  });

  it("false cuando la edad es menor al mínimo", () => {
    expect(isPolicyMet(1, 3)).toBe(false);
  });

  it("false cuando edad es 0 y política es 3", () => {
    expect(isPolicyMet(0, 3)).toBe(false);
  });

  it("null cuando ageInDays es null (fecha desconocida)", () => {
    expect(isPolicyMet(null, 3)).toBeNull();
  });
});

// ─── readRenovatePolicy ──────────────────────────────────────────────────────

describe("readRenovatePolicy", () => {
  it("retorna defaults con hasConfig=false si no hay renovate.json", () => {
    const p = readRenovatePolicy(TMP);
    expect(p.hasConfig).toBe(false);
    expect(p.patch).toBe(3);
    expect(p.minor).toBe(7);
    expect(p.major).toBe(30);
  });

  it("lee los delays correctamente del renovate.json", () => {
    writeFileSync(join(TMP, "renovate.json"), JSON.stringify({
      packageRules: [
        { matchUpdateTypes: ["patch"], minimumReleaseAge: "3 days" },
        { matchUpdateTypes: ["minor"], minimumReleaseAge: "7 days" },
        { matchUpdateTypes: ["major"], minimumReleaseAge: "30 days" },
      ],
    }));
    const p = readRenovatePolicy(TMP);
    expect(p.hasConfig).toBe(true);
    expect(p.patch).toBe(3);
    expect(p.minor).toBe(7);
    expect(p.major).toBe(30);
  });

  it("usa defaults para tipos no configurados en renovate.json", () => {
    writeFileSync(join(TMP, "renovate.json"), JSON.stringify({
      packageRules: [
        { matchUpdateTypes: ["patch"], minimumReleaseAge: "5 days" },
      ],
    }));
    const p = readRenovatePolicy(TMP);
    expect(p.patch).toBe(5);
    expect(p.minor).toBe(7);  // default
    expect(p.major).toBe(30); // default
  });

  it("acepta renovate.json en .github/renovate.json", () => {
    mkdirSync(join(TMP, ".github"), { recursive: true });
    writeFileSync(join(TMP, ".github/renovate.json"), JSON.stringify({
      packageRules: [
        { matchUpdateTypes: ["patch"], minimumReleaseAge: "10 days" },
      ],
    }));
    const p = readRenovatePolicy(TMP);
    expect(p.hasConfig).toBe(true);
    expect(p.patch).toBe(10);
  });

  it("retorna defaults con hasConfig=false si el JSON es inválido", () => {
    writeFileSync(join(TMP, "renovate.json"), "{ invalid json }");
    const p = readRenovatePolicy(TMP);
    expect(p.hasConfig).toBe(false);
  });
});

// ─── buildOutdatedPackage ────────────────────────────────────────────────────

describe("buildOutdatedPackage", () => {
  const policy = { patch: 3, minor: 7, major: 30, hasConfig: true };

  it("patch + policyMet → safeToUpdate true", () => {
    const date = new Date(Date.now() - 5 * 86_400_000); // 5 días
    const pkg  = buildOutdatedPackage("picocolors", "1.1.1", "1.1.2", date, policy);
    expect(pkg.updateType).toBe("patch");
    expect(pkg.policyMet).toBe(true);
    expect(pkg.safeToUpdate).toBe(true);
  });

  it("patch + policy NOT met → safeToUpdate false", () => {
    const date = new Date(Date.now() - 1 * 86_400_000); // 1 día
    const pkg  = buildOutdatedPackage("picocolors", "1.1.1", "1.1.2", date, policy);
    expect(pkg.updateType).toBe("patch");
    expect(pkg.policyMet).toBe(false);
    expect(pkg.safeToUpdate).toBe(false);
  });

  it("minor + policyMet → safeToUpdate false (minor nunca es auto-update)", () => {
    const date = new Date(Date.now() - 10 * 86_400_000); // 10 días
    const pkg  = buildOutdatedPackage("yargs", "18.0.0", "18.1.0", date, policy);
    expect(pkg.updateType).toBe("minor");
    expect(pkg.policyMet).toBe(true);
    expect(pkg.safeToUpdate).toBe(false);
  });

  it("major → safeToUpdate siempre false", () => {
    const date = new Date(Date.now() - 60 * 86_400_000); // 60 días
    const pkg  = buildOutdatedPackage("typescript", "5.9.3", "6.0.2", date, policy);
    expect(pkg.updateType).toBe("major");
    expect(pkg.safeToUpdate).toBe(false);
  });

  it("major en classifyUpdateType: 17.x → 18.x es major no minor", () => {
    expect(classifyUpdateType("17.7.2", "18.0.0")).toBe("major");
  });

  it("sin fecha → policyMet null, safeToUpdate false", () => {
    const pkg = buildOutdatedPackage("some-pkg", "1.0.0", "1.0.1", null, policy);
    expect(pkg.ageInDays).toBeNull();
    expect(pkg.policyMet).toBeNull();
    expect(pkg.safeToUpdate).toBe(false);
  });

  it("calcula policyDays correcto según el tipo", () => {
    const date = new Date(Date.now() - 5 * 86_400_000);
    const patch = buildOutdatedPackage("a", "1.0.0", "1.0.1", date, policy);
    const minor = buildOutdatedPackage("b", "1.0.0", "1.1.0", date, policy);
    const major = buildOutdatedPackage("c", "1.0.0", "2.0.0", date, policy);
    expect(patch.policyDays).toBe(3);
    expect(minor.policyDays).toBe(7);
    expect(major.policyDays).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NUEVOS CHECKS DE SEGURIDAD
// ═══════════════════════════════════════════════════════════════════════════════

// ─── checkGitignore ──────────────────────────────────────────────────────────

describe("checkGitignore", () => {
  it("error si .gitignore no existe — debe ser fixable", async () => {
    writePkg();
    const r = await checkGitignore(TMP);
    expect(r.status).toBe("error");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("warn si .gitignore existe pero falta .env", async () => {
    writeFileSync(join(TMP, ".gitignore"), "node_modules\n*.pem\n*.key\n");
    const r = await checkGitignore(TMP);
    expect(r.status).toBe("warn");
    expect(r.message).toContain(".env");
    expect(r.fixable).toBe(true);
  });

  it("warn si .gitignore existe pero falta *.pem", async () => {
    writeFileSync(join(TMP, ".gitignore"), ".env\n*.key\n");
    const r = await checkGitignore(TMP);
    expect(r.status).toBe("warn");
    expect(r.message).toContain("*.pem");
  });

  it("warn si .gitignore existe pero falta *.key", async () => {
    writeFileSync(join(TMP, ".gitignore"), ".env\n*.pem\n");
    const r = await checkGitignore(TMP);
    expect(r.status).toBe("warn");
    expect(r.message).toContain("*.key");
  });

  it("ok si .gitignore tiene todos los patrones requeridos", async () => {
    writeFileSync(join(TMP, ".gitignore"), ".env\n*.pem\n*.key\nnode_modules\n");
    const r = await checkGitignore(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain(".env");
    expect(r.message).toContain("*.pem");
    expect(r.message).toContain("*.key");
  });

  it("ok si usa .env* como patrón glob", async () => {
    writeFileSync(join(TMP, ".gitignore"), ".env*\n*.pem\n*.key\n");
    const r = await checkGitignore(TMP);
    expect(r.status).toBe("ok");
  });
});

// ─── applyGitignore ──────────────────────────────────────────────────────────

describe("applyGitignore", () => {
  it("crea .gitignore con todos los patrones de seguridad si no existe", async () => {
    await applyGitignore(TMP);
    const content = readFileSync(join(TMP, ".gitignore"), "utf-8");
    expect(content).toContain(".env");
    expect(content).toContain("*.pem");
    expect(content).toContain("*.key");
  });

  it("agrega patrones faltantes sin borrar el contenido existente", async () => {
    writeFileSync(join(TMP, ".gitignore"), "node_modules\ndist\n");
    await applyGitignore(TMP);
    const content = readFileSync(join(TMP, ".gitignore"), "utf-8");
    expect(content).toContain("node_modules");
    expect(content).toContain("dist");
    expect(content).toContain(".env");
    expect(content).toContain("*.pem");
  });

  it("después del fix checkGitignore retorna ok", async () => {
    await applyGitignore(TMP);
    const r = await checkGitignore(TMP);
    expect(r.status).toBe("ok");
  });
});

// ─── checkNodeVersion ────────────────────────────────────────────────────────

describe("checkNodeVersion", () => {
  it("warn si no existe .nvmrc ni engines.node — debe ser fixable", async () => {
    writePkg();
    const r = await checkNodeVersion(TMP);
    expect(r.status).toBe("warn");
    expect(r.fixable).toBe(true);
    expect(r.fix).toBeTypeOf("function");
  });

  it("warn si .nvmrc tiene versión menor a 18", async () => {
    writePkg();
    writeFileSync(join(TMP, ".nvmrc"), "16.20.0\n");
    const r = await checkNodeVersion(TMP);
    expect(r.status).toBe("warn");
    expect(r.message).toContain("16.20.0");
    expect(r.fixable).toBe(true);
  });

  it("ok si .nvmrc tiene versión >= 18", async () => {
    writePkg();
    writeFileSync(join(TMP, ".nvmrc"), "20.11.0\n");
    const r = await checkNodeVersion(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("20.11.0");
  });

  it("ok si .nvmrc tiene versión con prefijo v", async () => {
    writePkg();
    writeFileSync(join(TMP, ".nvmrc"), "v22.3.0\n");
    const r = await checkNodeVersion(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("22.3.0");
  });

  it("ok si package.json tiene engines.node", async () => {
    writePkg({ engines: { node: ">=20.0.0" } });
    const r = await checkNodeVersion(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain(">=20.0.0");
  });

  it("ok si existe .node-version", async () => {
    writePkg();
    writeFileSync(join(TMP, ".node-version"), "20.11.0\n");
    const r = await checkNodeVersion(TMP);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("20.11.0");
  });
});

// ─── applyNodeVersion ────────────────────────────────────────────────────────

describe("applyNodeVersion", () => {
  it("crea .nvmrc con la versión de node instalada", async () => {
    writePkg();
    await applyNodeVersion(TMP);
    const content = readFileSync(join(TMP, ".nvmrc"), "utf-8").trim();
    expect(content).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("después del fix checkNodeVersion retorna ok", async () => {
    writePkg();
    await applyNodeVersion(TMP);
    const r = await checkNodeVersion(TMP);
    expect(r.status).toBe("ok");
  });
});

// ─── checkSecrets ─────────────────────────────────────────────────────────────

describe("checkSecrets", () => {
  it("ok si no hay archivos con secrets", async () => {
    writeFileSync(join(TMP, "index.ts"), 'const greeting = "hello world";\n');
    const r = await checkSecrets(TMP);
    expect(r.status).toBe("ok");
  });

  it("error si encuentra una PEM private key", async () => {
    writeFileSync(join(TMP, "config.ts"), `
const key = \`-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4
-----END RSA PRIVATE KEY-----\`;
`);
    const r = await checkSecrets(TMP);
    expect(r.status).toBe("error");
    expect(r.hint!.join("\n")).toContain("config.ts");
  });

  it("error si encuentra un AWS access key", async () => {
    writeFileSync(join(TMP, "deploy.ts"), 'const awsKey = "AKIAIOSFODNN7EXAMPLE";\n');
    const r = await checkSecrets(TMP);
    expect(r.status).toBe("error");
    expect(r.hint!.join("\n")).toContain("deploy.ts");
  });

  it("error si encuentra un GitHub token", async () => {
    writeFileSync(join(TMP, "ci.ts"), 'const token = "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890";\n');
    const r = await checkSecrets(TMP);
    expect(r.status).toBe("error");
    expect(r.hint!.join("\n")).toContain("ci.ts");
  });

  it("warn si encuentra un secret generico hardcodeado", async () => {
    writeFileSync(join(TMP, "db.ts"), 'const password = "my_super_secret_db_pass";\n');
    const r = await checkSecrets(TMP);
    expect(r.status).not.toBe("ok");
  });

  it("ok si el valor es una variable de entorno (no hardcodeado)", async () => {
    writeFileSync(join(TMP, "config.ts"), 'const password = process.env.DB_PASSWORD;\n');
    const r = await checkSecrets(TMP);
    expect(r.status).toBe("ok");
  });

  it("no escanea node_modules", async () => {
    mkdirSync(join(TMP, "node_modules", "some-pkg"), { recursive: true });
    writeFileSync(
      join(TMP, "node_modules", "some-pkg", "index.js"),
      'const key = "AKIAIOSFODNN7EXAMPLE";\n'
    );
    const r = await checkSecrets(TMP);
    expect(r.status).toBe("ok");
  });

  it("incluye hint con instrucciones cuando detecta secrets", async () => {
    writeFileSync(join(TMP, "config.ts"), `
const key = \`-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xHn
-----END RSA PRIVATE KEY-----\`;
`);
    const r = await checkSecrets(TMP);
    expect(r.hint).toBeDefined();
    expect(r.hint!.length).toBeGreaterThan(0);
  });

  it("muestra número de línea en el hint", async () => {
    writeFileSync(join(TMP, "secrets.ts"), [
      'const greeting = "hello";',
      'const awsKey = "AKIAIOSFODNN7EXAMPLE";',
      'const other = "foo";',
    ].join("\n"));
    const r = await checkSecrets(TMP);
    const hintText = r.hint!.join("\n");
    expect(hintText).toContain("secrets.ts");
    expect(hintText).toContain("línea 2");
    expect(hintText).toContain("AWS access key");
  });

  it("el mensaje indica el conteo de secrets detectados", async () => {
    writeFileSync(join(TMP, "a.ts"), 'const k = "AKIAIOSFODNN7EXAMPLE";\n');
    writeFileSync(join(TMP, "b.ts"), 'const k = "AKIAIOSFODNN7EXAMPLE";\n');
    const r = await checkSecrets(TMP);
    expect(r.message).toMatch(/2.*secret/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCKER
// ═══════════════════════════════════════════════════════════════════════════════

import { analyzeDockerfile, buildProposedContent } from "../src/docker/analyze-dockerfile";
import { applyDockerfileFix } from "../src/docker/fix-dockerfile";

function writeDockerfile(content: string, name = "Dockerfile") {
  writeFileSync(join(TMP, name), content);
}

// ─── analyzeDockerfile — sin Dockerfile ─────────────────────────────────────

describe("analyzeDockerfile — sin Dockerfile", () => {
  it("retorna found=false si no hay Dockerfile", () => {
    writePkg();
    const results = analyzeDockerfile(TMP, "node");
    expect(results).toHaveLength(1);
    expect(results[0]!.found).toBe(false);
    expect(results[0]!.issues).toHaveLength(0);
  });
});

// ─── analyzeDockerfile — Node ────────────────────────────────────────────────

describe("analyzeDockerfile — Node", () => {
  it("detecta pnpm no pinned en npm install -g pnpm", () => {
    writePkg({ packageManager: "pnpm@10.25.0" });
    writeDockerfile("FROM node:20\nRUN npm install -g pnpm\n");
    const [r] = analyzeDockerfile(TMP, "node");
    const issue = r!.issues.find(x => x.kind === "pin-version");
    expect(issue).toBeDefined();
    expect(issue!.replacement).toContain("pnpm@10.25.0");
  });

  it("no reporta pin-version si pnpm ya está pinned", () => {
    writePkg({ packageManager: "pnpm@10.25.0" });
    writeDockerfile("FROM node:20\nRUN npm install -g pnpm@10.25.0\n");
    const [r] = analyzeDockerfile(TMP, "node");
    expect(r!.issues.filter(x => x.kind === "pin-version")).toHaveLength(0);
  });

  it("detecta pnpm install sin --frozen-lockfile y --ignore-scripts", () => {
    writePkg();
    writeDockerfile("FROM node:20\nCOPY .npmrc .\nRUN pnpm install\n");
    const [r] = analyzeDockerfile(TMP, "node");
    const flagIssue = r!.issues.find(x => x.kind === "missing-flag");
    expect(flagIssue).toBeDefined();
    expect(flagIssue!.description).toContain("--frozen-lockfile");
    expect(flagIssue!.description).toContain("--ignore-scripts");
  });

  it("no reporta missing-flag si pnpm install tiene ambos flags", () => {
    writePkg();
    writeDockerfile("FROM node:20\nCOPY .npmrc .\nRUN pnpm install --frozen-lockfile --ignore-scripts\n");
    const [r] = analyzeDockerfile(TMP, "node");
    expect(r!.issues.filter(x => x.kind === "missing-flag")).toHaveLength(0);
  });

  it("detecta .npmrc no copiado antes de pnpm install", () => {
    writePkg();
    writeDockerfile("FROM node:20\nRUN pnpm install\n");
    const [r] = analyzeDockerfile(TMP, "node");
    const copyIssue = r!.issues.find(x => x.kind === "missing-copy");
    expect(copyIssue).toBeDefined();
    expect(copyIssue!.replacement).toBe("COPY .npmrc .");
  });

  it("no reporta missing-copy si .npmrc ya está copiado antes del install", () => {
    writePkg();
    writeDockerfile("FROM node:20\nCOPY .npmrc .\nRUN pnpm install --frozen-lockfile --ignore-scripts\n");
    const [r] = analyzeDockerfile(TMP, "node");
    expect(r!.issues.filter(x => x.kind === "missing-copy")).toHaveLength(0);
  });

  it("detecta corepack prepare pnpm sin versión", () => {
    writePkg({ packageManager: "pnpm@10.25.0" });
    writeDockerfile("FROM node:20\nRUN corepack enable && corepack prepare pnpm\n");
    const [r] = analyzeDockerfile(TMP, "node");
    const issue = r!.issues.find(x => x.kind === "pin-version");
    expect(issue).toBeDefined();
    expect(issue!.replacement).toContain("pnpm@10.25.0");
  });

  it("Dockerfile correcto — cero issues", () => {
    writePkg({ packageManager: "pnpm@10.25.0" });
    writeDockerfile([
      "FROM node:20",
      "RUN npm install -g pnpm@10.25.0",
      "COPY .npmrc .",
      "COPY package.json pnpm-lock.yaml ./",
      "RUN pnpm install --frozen-lockfile --ignore-scripts",
    ].join("\n") + "\n");
    const [r] = analyzeDockerfile(TMP, "node");
    expect(r!.issues).toHaveLength(0);
    expect(r!.proposedContent).toBeNull();
  });

  it("detecta múltiples Dockerfiles (Dockerfile + Dockerfile.dev)", () => {
    writePkg();
    writeDockerfile("FROM node:20\nRUN pnpm install\n", "Dockerfile");
    writeDockerfile("FROM node:20\nRUN pnpm install\n", "Dockerfile.dev");
    const results = analyzeDockerfile(TMP, "node");
    expect(results).toHaveLength(2);
    expect(results.every(r => r.found)).toBe(true);
  });
});

// ─── analyzeDockerfile — Python ──────────────────────────────────────────────

describe("analyzeDockerfile — Python", () => {
  it("detecta poetry install sin --no-interaction y --no-root", () => {
    writePyproject();
    writeDockerfile("FROM python:3.12\nCOPY . .\nRUN poetry install\n");
    const [r] = analyzeDockerfile(TMP, "python");
    const flagIssue = r!.issues.find(x => x.kind === "missing-flag");
    expect(flagIssue).toBeDefined();
    expect(flagIssue!.description).toContain("--no-interaction");
    expect(flagIssue!.description).toContain("--no-root");
  });

  it("no reporta missing-flag si poetry install tiene ambos flags", () => {
    writePyproject();
    writeDockerfile("FROM python:3.12\nCOPY . .\nRUN poetry install --no-interaction --no-root\n");
    const [r] = analyzeDockerfile(TMP, "python");
    expect(r!.issues.filter(x => x.kind === "missing-flag")).toHaveLength(0);
  });

  it("detecta .python-version no copiado antes de poetry install", () => {
    writePyproject();
    writeDockerfile("FROM python:3.12\nRUN poetry install\n");
    const [r] = analyzeDockerfile(TMP, "python");
    const copyIssue = r!.issues.find(x => x.replacement === "COPY .python-version .");
    expect(copyIssue).toBeDefined();
  });

  it("detecta poetry.toml no copiado antes de poetry install", () => {
    writePyproject();
    writeDockerfile("FROM python:3.12\nCOPY .python-version .\nRUN poetry install\n");
    const [r] = analyzeDockerfile(TMP, "python");
    const copyIssue = r!.issues.find(x => x.replacement === "COPY poetry.toml .");
    expect(copyIssue).toBeDefined();
  });

  it("no reporta missing-copy si COPY . . cubre todos los archivos", () => {
    writePyproject();
    writeDockerfile("FROM python:3.12\nCOPY . .\nRUN poetry install --no-interaction --no-root\n");
    const [r] = analyzeDockerfile(TMP, "python");
    expect(r!.issues.filter(x => x.kind === "missing-copy")).toHaveLength(0);
  });

  it("detecta pip install sin --no-cache-dir", () => {
    writePyproject();
    writeDockerfile("FROM python:3.12\nRUN pip install requests\n");
    const [r] = analyzeDockerfile(TMP, "python");
    const issue = r!.issues.find(x => x.kind === "missing-flag");
    expect(issue).toBeDefined();
    expect(issue!.replacement).toContain("--no-cache-dir");
  });

  it("detecta pip install -r requirements.txt como advisory", () => {
    writePyproject();
    writeDockerfile("FROM python:3.12\nRUN pip install --no-cache-dir -r requirements.txt\n");
    const [r] = analyzeDockerfile(TMP, "python");
    const advisory = r!.issues.find(x => x.kind === "advisory");
    expect(advisory).toBeDefined();
    expect(advisory!.replacement).toBeNull();
  });

  it("Dockerfile correcto — cero issues", () => {
    writePyproject();
    writeDockerfile([
      "FROM python:3.12",
      "COPY .python-version .",
      "COPY poetry.toml .",
      "COPY pyproject.toml poetry.lock ./",
      "RUN poetry install --no-interaction --no-root",
    ].join("\n") + "\n");
    const [r] = analyzeDockerfile(TMP, "python");
    expect(r!.issues).toHaveLength(0);
  });
});

// ─── buildProposedContent ────────────────────────────────────────────────────

describe("buildProposedContent", () => {
  it("inserta COPY .npmrc antes de RUN pnpm install", () => {
    const lines = ["FROM node:20", "RUN pnpm install"];
    const issues = [{
      line: 2, kind: "missing-copy" as const,
      description: "", original: "RUN pnpm install", replacement: "COPY .npmrc .",
    }];
    const result = buildProposedContent(lines, issues);
    expect(result).toBe("FROM node:20\nCOPY .npmrc .\nRUN pnpm install");
  });

  it("agrega flags a RUN pnpm install", () => {
    const lines = ["FROM node:20", "RUN pnpm install"];
    const issues = [{
      line: 2, kind: "missing-flag" as const,
      description: "", original: "RUN pnpm install",
      replacement: "RUN pnpm install --frozen-lockfile --ignore-scripts",
    }];
    const result = buildProposedContent(lines, issues);
    expect(result).toContain("--frozen-lockfile --ignore-scripts");
  });

  it("combina COPY + flags en la misma línea", () => {
    const lines = ["FROM node:20", "RUN pnpm install"];
    const issues = [
      { line: 2, kind: "missing-copy" as const, description: "", original: "RUN pnpm install", replacement: "COPY .npmrc ." },
      { line: 2, kind: "missing-flag" as const, description: "", original: "RUN pnpm install", replacement: "RUN pnpm install --frozen-lockfile --ignore-scripts" },
    ];
    const result = buildProposedContent(lines, issues);
    const resultLines = result.split("\n");
    expect(resultLines[1]).toBe("COPY .npmrc .");
    expect(resultLines[2]).toBe("RUN pnpm install --frozen-lockfile --ignore-scripts");
  });
});

// ─── applyDockerfileFix ──────────────────────────────────────────────────────

describe("applyDockerfileFix", () => {
  it("escribe proposedContent al archivo", () => {
    writePkg({ packageManager: "pnpm@10.25.0" });
    writeDockerfile("FROM node:20\nRUN pnpm install\n");

    const [analysis] = analyzeDockerfile(TMP, "node");
    expect(analysis!.proposedContent).not.toBeNull();

    applyDockerfileFix(analysis!);

    const written = readFileSync(join(TMP, "Dockerfile"), "utf-8");
    expect(written).toContain("COPY .npmrc .");
    expect(written).toContain("--frozen-lockfile");
    expect(written).toContain("--ignore-scripts");
  });

  it("no hace nada si proposedContent es null", () => {
    writePkg({ packageManager: "pnpm@10.25.0" });
    const original = [
      "FROM node:20",
      "RUN npm install -g pnpm@10.25.0",
      "COPY .npmrc .",
      "RUN pnpm install --frozen-lockfile --ignore-scripts",
    ].join("\n") + "\n";
    writeDockerfile(original);

    const [analysis] = analyzeDockerfile(TMP, "node");
    expect(analysis!.proposedContent).toBeNull();
    applyDockerfileFix(analysis!);

    const written = readFileSync(join(TMP, "Dockerfile"), "utf-8");
    expect(written).toBe(original);
  });
});
