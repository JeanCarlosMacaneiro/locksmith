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

import { checkPyproject }     from "../src/checks/python/check-pyproject";
import { checkPoetryToml }    from "../src/checks/python/check-poetry-toml";
import { checkPoetryLock }    from "../src/checks/python/check-poetry-lock";
import { checkDepGroups }     from "../src/checks/python/check-dep-groups";
import { checkPythonVersion } from "../src/checks/python/check-python-version";
import { checkPypiSource }    from "../src/checks/python/check-pypi-source";

import {
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
