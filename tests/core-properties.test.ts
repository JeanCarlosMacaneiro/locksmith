/**
 * Property-based tests for pure logic modules and Docker flow functions.
 *
 * NO mock.module() calls — all tests use real implementations.
 * Docker flow property tests verify behavior via the filesystem, avoiding
 * cross-file module mock contamination in bun 1.3.x.
 *
 * File must sort before docker-modes.test.ts ('co' < 'do') so it imports
 * the real prompt-dockerfile before docker-modes.test.ts mocks it.
 */

import { describe, it, beforeEach, afterEach } from "bun:test";
import fc from "fast-check";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  classifyUpdateType,
  calcAgeInDays,
  isPolicyMet,
} from "../src/outdated/classify";

import { buildProposedContent, analyzeDockerfile } from "../src/docker/analyze-dockerfile";
import { showDockerWarnings, promptDockerFix } from "../src/docker/prompt-dockerfile";
import type { DockerIssue } from "../src/types";

// ── Arbitraries ───────────────────────────────────────────────────────────────

const fixableIssueArb = fc.record({
  line:        fc.integer({ min: 1, max: 100 }),
  kind:        fc.constantFrom(
    "pin-version", "missing-flag", "missing-copy", "missing-cmd", "update-from"
  ) as fc.Arbitrary<DockerIssue["kind"]>,
  description: fc.string({ minLength: 1 }),
  original:    fc.string({ minLength: 1 }),
  replacement: fc.string({ minLength: 1 }),
});

// ── classifyUpdateType ────────────────────────────────────────────────────────

describe("classifyUpdateType — properties", () => {
  it("solo patch cambia → retorna 'patch'", () =>
    fc.assert(fc.property(
      fc.tuple(fc.nat(20), fc.nat(20), fc.nat(20)),
      ([major, minor, patch]) => {
        const current = `${major}.${minor}.${patch}`;
        const latest  = `${major}.${minor}.${patch + 1}`;
        return classifyUpdateType(current, latest) === "patch";
      }
    ), { numRuns: 100 })
  );

  it("solo minor cambia → retorna 'minor'", () =>
    fc.assert(fc.property(
      fc.tuple(fc.nat(20), fc.nat(20), fc.nat(20)),
      ([major, minor, patch]) => {
        const current = `${major}.${minor}.${patch}`;
        const latest  = `${major}.${minor + 1}.0`;
        return classifyUpdateType(current, latest) === "minor";
      }
    ), { numRuns: 100 })
  );

  it("solo major cambia → retorna 'major'", () =>
    fc.assert(fc.property(
      fc.tuple(fc.nat(20), fc.nat(20), fc.nat(20)),
      ([major, minor, patch]) => {
        const current = `${major}.${minor}.${patch}`;
        const latest  = `${major + 1}.0.0`;
        return classifyUpdateType(current, latest) === "major";
      }
    ), { numRuns: 100 })
  );

  it("resultado siempre es 'patch' | 'minor' | 'major'", () =>
    fc.assert(fc.property(
      fc.tuple(fc.nat(20), fc.nat(20), fc.nat(20)),
      fc.tuple(fc.nat(20), fc.nat(20), fc.nat(20)),
      ([mj1, mn1, p1], [mj2, mn2, p2]) => {
        const result = classifyUpdateType(`${mj1}.${mn1}.${p1}`, `${mj2}.${mn2}.${p2}`);
        return ["patch", "minor", "major"].includes(result);
      }
    ), { numRuns: 100 })
  );
});

// ── calcAgeInDays ─────────────────────────────────────────────────────────────

describe("calcAgeInDays — properties", () => {
  it("fecha en el pasado → retorna >= 0", () =>
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 365 * 10 }),
      (daysAgo) => calcAgeInDays(new Date(Date.now() - daysAgo * 86_400_000)) >= 0
    ), { numRuns: 100 })
  );

  it("fecha más antigua retorna valor mayor o igual que más reciente", () =>
    fc.assert(fc.property(
      fc.tuple(fc.nat(3650), fc.nat(3650)),
      ([a, b]) => {
        const older = new Date(Date.now() - Math.max(a, b) * 86_400_000);
        const newer = new Date(Date.now() - Math.min(a, b) * 86_400_000);
        return calcAgeInDays(older) >= calcAgeInDays(newer);
      }
    ), { numRuns: 100 })
  );

  it("fecha de hoy → retorna 0", () =>
    fc.assert(fc.property(
      fc.constant(new Date()),
      (today) => calcAgeInDays(today) === 0
    ), { numRuns: 100 })
  );
});

// ── isPolicyMet ───────────────────────────────────────────────────────────────

describe("isPolicyMet — properties", () => {
  it("ageInDays >= policyDays → true", () =>
    fc.assert(fc.property(
      fc.nat(100),
      fc.nat(100),
      (age, policy) => {
        fc.pre(age >= policy);
        return isPolicyMet(age, policy) === true;
      }
    ), { numRuns: 100 })
  );

  it("ageInDays < policyDays → false", () =>
    fc.assert(fc.property(
      fc.nat(100),
      fc.integer({ min: 1, max: 100 }),
      (age, extra) => isPolicyMet(age, age + extra) === false
    ), { numRuns: 100 })
  );

  it("ageInDays null → null", () =>
    fc.assert(fc.property(
      fc.nat(100),
      (policy) => isPolicyMet(null, policy) === null
    ), { numRuns: 100 })
  );
});

// ── buildProposedContent ──────────────────────────────────────────────────────

describe("buildProposedContent — properties", () => {
  it("output tiene igual o más líneas que input", () =>
    fc.assert(fc.property(
      fc.array(fc.string(), { minLength: 1, maxLength: 20 }),
      (lines) => buildProposedContent(lines, []).split("\n").length >= lines.length
    ), { numRuns: 100 })
  );

  it("issues advisory (replacement=null) no modifican línea referenciada", () =>
    fc.assert(fc.property(
      fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }),
      fc.integer({ min: 1, max: 20 }),
      (lines, lineIdx) => {
        const lineNum = Math.min(lineIdx, lines.length);
        const issues = [
          {
            line: lineNum,
            kind: "advisory" as const,
            description: "test",
            original: lines[lineNum - 1] ?? "",
            replacement: null as null,
          },
        ];
        const outputLines = buildProposedContent(lines, issues).split("\n");
        return outputLines[lineNum - 1] === lines[lineNum - 1];
      }
    ), { numRuns: 100 })
  );
});

// ── analyzeDockerfile ─────────────────────────────────────────────────────────

describe("analyzeDockerfile — properties", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "lk-analyze-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("Dockerfile sin RUN → no genera issues de tipo missing-flag", () =>
    fc.assert(fc.asyncProperty(
      fc.array(
        fc.constantFrom(
          "FROM node:20-alpine",
          "WORKDIR /app",
          "COPY . .",
          "EXPOSE 3000",
          'CMD ["node","index.js"]',
        ),
        { minLength: 1, maxLength: 10 }
      ),
      async (lines) => {
        writeFileSync(join(dir, "Dockerfile"), lines.join("\n"));
        const results = analyzeDockerfile(dir, "node");
        return !results.flatMap(r => r.issues).some(x => x.kind === "missing-flag");
      }
    ), { numRuns: 100 })
  );

  it("Dockerfile con COPY . . → no genera issues de tipo missing-copy", () =>
    fc.assert(fc.asyncProperty(
      fc.constant(null),
      async () => {
        const lines = [
          "FROM node:20-alpine",
          "WORKDIR /app",
          "COPY . .",
          "ENV CI=true",
          "RUN corepack enable",
          "RUN pnpm install --frozen-lockfile --ignore-scripts",
          'CMD ["node","index.js"]',
        ];
        writeFileSync(join(dir, "Dockerfile"), lines.join("\n"));
        const results = analyzeDockerfile(dir, "node");
        return !results.flatMap(r => r.issues).some(x => x.kind === "missing-copy");
      }
    ), { numRuns: 1 })
  );

  it("proposedContent es null ↔ no hay issues fixables", () =>
    fc.assert(fc.asyncProperty(
      fc.array(
        fc.constantFrom(
          "FROM node:20-alpine",
          "FROM node:latest",
          "WORKDIR /app",
          "COPY . .",
          "ENV CI=true",
          "RUN corepack enable",
          "RUN pnpm install --frozen-lockfile --ignore-scripts",
          "RUN pnpm install",
          'CMD ["node","index.js"]',
        ),
        { minLength: 1, maxLength: 8 }
      ),
      async (lines) => {
        writeFileSync(join(dir, "Dockerfile"), lines.join("\n"));
        const results = analyzeDockerfile(dir, "node");
        return results.every(r => {
          if (!r.found) return true;
          const hasFixable = r.issues.some(x => x.replacement !== null);
          return hasFixable ? r.proposedContent !== null : r.proposedContent === null;
        });
      }
    ), { numRuns: 100 })
  );
});

// ── Docker flow properties (filesystem-based — no mock.module needed) ─────────

describe("showDockerWarnings — Property 1: Audit_Mode no modifica Dockerfiles", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "lk-prop1-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // Feature: dockerfile-audit-modes, Property 1: Audit_Mode no modifica Dockerfiles
  it("showDockerWarnings nunca modifica el archivo en disco", () =>
    fc.assert(fc.asyncProperty(
      fc.array(fixableIssueArb, { minLength: 1 }),
      async (issues) => {
        const dockerfilePath = join(dir, "Dockerfile");
        const original = "FROM node:20-alpine\nWORKDIR /app\n";
        writeFileSync(dockerfilePath, original);

        const analyses = [{
          found: true,
          dockerfilePath,
          issues,
          proposedContent: "SHOULD NOT BE WRITTEN",
        }];
        await showDockerWarnings(analyses, dir);

        return readFileSync(dockerfilePath, "utf-8") === original;
      }
    ), { numRuns: 100 })
  );
});

describe("promptDockerFix — properties (filesystem-based)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "lk-prop35-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // Feature: dockerfile-audit-modes, Property 3: promptDockerFix con autoFix=true aplica fixes
  it("autoFix=true escribe proposedContent en el Dockerfile", () =>
    fc.assert(fc.asyncProperty(
      fc.array(fixableIssueArb, { minLength: 1 }),
      fc.string({ minLength: 1 }),
      async (issues, proposedContent) => {
        const dockerfilePath = join(dir, "Dockerfile");
        writeFileSync(dockerfilePath, "FROM node:20\n");

        const analyses = [{ found: true, dockerfilePath, issues, proposedContent }];
        await promptDockerFix(analyses, dir, true);

        return readFileSync(dockerfilePath, "utf-8") === proposedContent;
      }
    ), { numRuns: 100 })
  );

  // Feature: dockerfile-audit-modes, Property 4 (non-TTY path):
  // promptDockerFix con autoFix=false en entorno sin TTY no modifica archivos (Req 2.5)
  it("autoFix=false en entorno no-TTY no modifica archivos", () =>
    fc.assert(fc.asyncProperty(
      fc.array(fixableIssueArb, { minLength: 1 }),
      async (issues) => {
        const dockerfilePath = join(dir, "Dockerfile");
        const original = "FROM node:20-alpine\n";
        writeFileSync(dockerfilePath, original);

        const analyses = [{ found: true, dockerfilePath, issues, proposedContent: "CHANGED" }];
        // In test environments process.stdin.isTTY is false — promptDockerFix skips fixes
        await promptDockerFix(analyses, dir, false);

        return readFileSync(dockerfilePath, "utf-8") === original;
      }
    ), { numRuns: 100 })
  );
});
