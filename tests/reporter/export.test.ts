import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import fc from "fast-check";
import { exportReport } from "../../src/reporter/export";
import type { CheckResult } from "../../src/types";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "locksmith-export-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const arbStatus = fc.oneof(
  fc.constant("ok"    as const),
  fc.constant("warn"  as const),
  fc.constant("error" as const),
);

const arbCheckResult = fc.record({
  name:     fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[\w\s.-]+$/.test(s)),
  status:   arbStatus,
  message:  fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes("|")),
  fixable:  fc.boolean(),
  wasFixed: fc.boolean(),
});

const arbResults = fc.array(arbCheckResult, { minLength: 0, maxLength: 20 });

// ── Property tests ────────────────────────────────────────────────

describe("exportReport JSON — property tests", () => {
  it("P9: JSON exportado preserva sections, wasFixed y summary", async () => {
    await fc.assert(fc.asyncProperty(arbResults, async (results) => {
      await exportReport(results, "json", dir);
      const json = JSON.parse(readFileSync(join(dir, "security-report.json"), "utf8"));

      const fixed    = results.filter(r => r.wasFixed);
      const errors   = results.filter(r => r.status === "error" && !r.wasFixed);
      const warnings = results.filter(r => r.status === "warn"  && !r.wasFixed);
      const oks      = results.filter(r => r.status === "ok"    && !r.wasFixed);

      expect(json.sections.errors.length).toBe(errors.length);
      expect(json.sections.warnings.length).toBe(warnings.length);
      expect(json.sections.ok.length).toBe(oks.length + fixed.length);

      expect(json.summary.ok + json.summary.warn + json.summary.error).toBe(results.length);

      // wasFixed count preserved in checks[]
      const inputFixed  = results.filter(r => r.wasFixed).length;
      const outputFixed = json.checks.filter((c: { wasFixed: boolean }) => c.wasFixed).length;
      expect(outputFixed).toBe(inputFixed);
    }), { numRuns: 50 });
  });
});

describe("exportReport Markdown — property tests", () => {
  it("P10: Markdown tem tabelas separadas por sección", async () => {
    await fc.assert(fc.asyncProperty(arbResults, async (results) => {
      await exportReport(results, "markdown", dir);
      const md = readFileSync(join(dir, "security-report.md"), "utf8");

      const hasErrors  = results.some(r => r.status === "error" && !r.wasFixed);
      const hasWarnings = results.some(r => r.status === "warn"  && !r.wasFixed);
      const hasOk      = results.some(r => r.status === "ok" || r.wasFixed);

      if (hasErrors)   expect(md).toContain("## Errores");
      else             expect(md).not.toContain("## Errores");

      if (hasWarnings) expect(md).toContain("## Advertencias");
      else             expect(md).not.toContain("## Advertencias");

      if (hasOk)       expect(md).toContain("## OK");
      else             expect(md).not.toContain("## OK");
    }), { numRuns: 50 });
  });
});

// ── Unit tests ────────────────────────────────────────────────────

describe("exportReport JSON — unit tests", () => {
  it("incluye sections con clasificación correcta", async () => {
    const results: CheckResult[] = [
      { name: "a", status: "error", message: "e", fixable: false },
      { name: "b", status: "warn",  message: "w", fixable: true  },
      { name: "c", status: "ok",    message: "o", fixable: false },
    ];
    await exportReport(results, "json", dir);
    const json = JSON.parse(readFileSync(join(dir, "security-report.json"), "utf8"));
    expect(json.sections.errors.map((x: { name: string }) => x.name)).toEqual(["a"]);
    expect(json.sections.warnings.map((x: { name: string }) => x.name)).toEqual(["b"]);
    expect(json.sections.ok.map((x: { name: string }) => x.name)).toEqual(["c"]);
  });

  it("mantiene campo checks[] con todos los resultados", async () => {
    const results: CheckResult[] = [
      { name: "a", status: "error", message: "e" },
      { name: "b", status: "ok",    message: "o" },
    ];
    await exportReport(results, "json", dir);
    const json = JSON.parse(readFileSync(join(dir, "security-report.json"), "utf8"));
    expect(json.checks.length).toBe(2);
    expect(json.checks.map((c: { name: string }) => c.name)).toEqual(["a", "b"]);
  });

  it("incluye wasFixed: true en entradas que lo tenían", async () => {
    const results: CheckResult[] = [
      { name: "a", status: "error", message: "e", wasFixed: true },
      { name: "b", status: "ok",    message: "o", wasFixed: false },
    ];
    await exportReport(results, "json", dir);
    const json = JSON.parse(readFileSync(join(dir, "security-report.json"), "utf8"));
    const a = json.checks.find((c: { name: string }) => c.name === "a");
    const b = json.checks.find((c: { name: string }) => c.name === "b");
    expect(a.wasFixed).toBe(true);
    expect(b.wasFixed).toBe(false);
  });

  it("wasFixed=true → check está en sections.ok, no en sections.errors", async () => {
    const results: CheckResult[] = [
      { name: "a", status: "error", message: "e", wasFixed: true },
    ];
    await exportReport(results, "json", dir);
    const json = JSON.parse(readFileSync(join(dir, "security-report.json"), "utf8"));
    expect(json.sections.errors.length).toBe(0);
    expect(json.sections.ok.map((c: { name: string }) => c.name)).toContain("a");
  });

  it("array vacío → sections con arrays vacíos y summary con ceros", async () => {
    await exportReport([], "json", dir);
    const json = JSON.parse(readFileSync(join(dir, "security-report.json"), "utf8"));
    expect(json.sections.errors).toEqual([]);
    expect(json.sections.warnings).toEqual([]);
    expect(json.sections.ok).toEqual([]);
    expect(json.summary.ok).toBe(0);
    expect(json.summary.warn).toBe(0);
    expect(json.summary.error).toBe(0);
  });

  it("summary.ok + summary.warn + summary.error === results.length", async () => {
    const results: CheckResult[] = [
      { name: "a", status: "error", message: "e" },
      { name: "b", status: "warn",  message: "w" },
      { name: "c", status: "ok",    message: "o" },
      { name: "d", status: "error", message: "e2", wasFixed: true },
    ];
    await exportReport(results, "json", dir);
    const json = JSON.parse(readFileSync(join(dir, "security-report.json"), "utf8"));
    expect(json.summary.ok + json.summary.warn + json.summary.error).toBe(results.length);
  });
});

describe("exportReport Markdown — unit tests", () => {
  it("omite ## Errores si no hay errores", async () => {
    const results: CheckResult[] = [
      { name: "a", status: "ok", message: "o" },
    ];
    await exportReport(results, "markdown", dir);
    const md = readFileSync(join(dir, "security-report.md"), "utf8");
    expect(md).not.toContain("## Errores");
    expect(md).toContain("## OK");
  });

  it("omite ## Advertencias si no hay warnings", async () => {
    const results: CheckResult[] = [
      { name: "a", status: "error", message: "e" },
    ];
    await exportReport(results, "markdown", dir);
    const md = readFileSync(join(dir, "security-report.md"), "utf8");
    expect(md).not.toContain("## Advertencias");
    expect(md).toContain("## Errores");
  });

  it("array vacío no lanza error y no tiene secciones", async () => {
    await expect(exportReport([], "markdown", dir)).resolves.toBeUndefined();
    const md = readFileSync(join(dir, "security-report.md"), "utf8");
    expect(md).not.toContain("##");
  });

  it("checks con wasFixed aparecen en ## OK con badge [fixed]", async () => {
    const results: CheckResult[] = [
      { name: "npmrc", status: "error", message: "e", wasFixed: true },
    ];
    await exportReport(results, "markdown", dir);
    const md = readFileSync(join(dir, "security-report.md"), "utf8");
    expect(md).toContain("## OK");
    expect(md).not.toContain("## Errores");
    expect(md).toContain("npmrc [fixed]");
  });

  it("cada check aparece en la tabla de su categoría", async () => {
    const results: CheckResult[] = [
      { name: "err-check", status: "error", message: "falla"      },
      { name: "wrn-check", status: "warn",  message: "advertencia" },
      { name: "ok-check",  status: "ok",    message: "ok"          },
    ];
    await exportReport(results, "markdown", dir);
    const md = readFileSync(join(dir, "security-report.md"), "utf8");
    const errSection  = md.slice(md.indexOf("## Errores"),      md.indexOf("## Advertencias"));
    const warnSection = md.slice(md.indexOf("## Advertencias"), md.indexOf("## OK"));
    const okSection   = md.slice(md.indexOf("## OK"));
    expect(errSection).toContain("err-check");
    expect(warnSection).toContain("wrn-check");
    expect(okSection).toContain("ok-check");
  });
});
