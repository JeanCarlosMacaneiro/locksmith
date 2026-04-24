import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { printReport } from "../../src/reporter/console";
import type { CheckResult } from "../../src/types";

function captureOutput(fn: () => void): string {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  fn();
  console.log = orig;
  return lines.join("\n");
}

// Strips ANSI color codes for easier assertion
function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

const arbStatus = fc.oneof(
  fc.constant("ok"    as const),
  fc.constant("warn"  as const),
  fc.constant("error" as const),
);

const arbCheckResult = fc.record({
  name:     fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes("\x1b") && s.trim().length > 0),
  status:   arbStatus,
  message:  fc.string({ minLength: 1 }).filter(s => !s.includes("\x1b") && s.trim().length > 0),
  fixable:  fc.boolean(),
  wasFixed: fc.boolean(),
  hint:     fc.option(fc.array(fc.string({ minLength: 2 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }), { nil: undefined }),
});

const arbResults = fc.array(arbCheckResult, { minLength: 1, maxLength: 20 });

// ── Property tests ────────────────────────────────────────────────

describe("printReport — property tests", () => {
  it("P1: executive summary refleja distribución real", () => {
    fc.assert(fc.property(arbResults, (results) => {
      const out = strip(captureOutput(() => printReport(results)));
      const fixed  = results.filter(r => r.wasFixed).length;
      const errors = results.filter(r => r.status === "error" && !r.wasFixed).length;
      const warns  = results.filter(r => r.status === "warn"  && !r.wasFixed).length;
      const oks    = results.filter(r => r.status === "ok"    && !r.wasFixed).length + fixed;
      if (errors > 0) expect(out).toContain(`${errors} error`);
      if (warns  > 0) expect(out).toContain(`${warns} advertencia`);
      expect(out).toContain(`${oks} ok`);
    }), { numRuns: 100 });
  });

  it("P2: secciones vacías se omiten del output", () => {
    fc.assert(fc.property(arbResults, (results) => {
      const out = strip(captureOutput(() => printReport(results)));
      const hasErrors  = results.some(r => r.status === "error" && !r.wasFixed);
      const hasWarns   = results.some(r => r.status === "warn"  && !r.wasFixed);
      const hasOk      = results.some(r => (r.status === "ok" || r.wasFixed));
      if (!hasErrors) expect(out).not.toContain("ACCIÓN REQUERIDA");
      if (!hasWarns)  expect(out).not.toContain("ADVERTENCIAS");
      if (!hasOk)     expect(out).not.toContain("TODO OK");
    }), { numRuns: 100 });
  });

  it("P3: orden de secciones es invariante", () => {
    fc.assert(fc.property(arbResults, (results) => {
      // Only meaningful when multiple sections present
      const hasErrors = results.some(r => r.status === "error" && !r.wasFixed);
      const hasWarns  = results.some(r => r.status === "warn"  && !r.wasFixed);
      const hasOk     = results.some(r => r.status === "ok" || r.wasFixed);
      if (!hasErrors || !hasWarns || !hasOk) return;
      const out = strip(captureOutput(() => printReport(results)));
      const posErr  = out.indexOf("ACCIÓN REQUERIDA");
      const posWarn = out.indexOf("ADVERTENCIAS");
      const posOk   = out.indexOf("TODO OK");
      expect(posErr).toBeLessThan(posWarn);
      expect(posWarn).toBeLessThan(posOk);
    }), { numRuns: 100 });
  });

  it("P4: línea colapsada contiene todos los checks ok con conteo correcto", () => {
    fc.assert(fc.property(arbResults, (results) => {
      const okChecks = results.filter(r => r.status === "ok" || r.wasFixed);
      if (okChecks.length === 0) return;
      const out = strip(captureOutput(() => printReport(results)));
      expect(out).toContain(`(${okChecks.length} checks)`);
      for (const r of okChecks) {
        expect(out).toContain(r.name);
      }
    }), { numRuns: 100 });
  });

  it("P5: action prompt aparece si y solo si hay fixables", () => {
    fc.assert(fc.property(arbResults, (results) => {
      const hasFixable = results.some(r => r.fixable && !r.wasFixed &&
        (r.status === "error" || r.status === "warn"));
      const out = strip(captureOutput(() => printReport(results)));
      if (hasFixable) {
        expect(out).toContain("locksmith . --fix");
      } else {
        expect(out).not.toContain("locksmith . --fix");
      }
    }), { numRuns: 100 });
  });

  it("P6: hints aparecen inline inmediatamente después del check", () => {
    fc.assert(fc.property(arbResults, (results) => {
      // Only check results that are in sections (not ok/fixed)
      const sectionChecks = results.filter(
        r => !r.wasFixed && (r.status === "error" || r.status === "warn") &&
        r.hint && r.hint.length > 0
      );
      if (sectionChecks.length === 0) return;
      // Skip if any name is ambiguous (appears in multiple checks)
      const names = results.map(r => r.name);
      const uniqueSectionChecks = sectionChecks.filter(
        r => names.filter(n => n === r.name).length === 1
      );
      if (uniqueSectionChecks.length === 0) return;
      const lines = captureOutput(() => printReport(results)).split("\n");
      for (const r of uniqueSectionChecks) {
        const icon = r.status === "error" ? "✗" : "⚠";
        const checkIdx = lines.findIndex(l => strip(l).includes(`${icon} ${r.name}`));
        if (checkIdx === -1) continue;
        const firstHint = r.hint![0];
        expect(strip(lines[checkIdx + 1])).toContain(firstHint.slice(0, 20));
      }
    }), { numRuns: 100 });
  });

  it("P7: wasFixed implica ✓, [fixed] badge e ubicación en TODO OK", () => {
    fc.assert(fc.property(arbResults, (results) => {
      const fixedChecks = results.filter(r => r.wasFixed);
      if (fixedChecks.length === 0) return;
      const out = strip(captureOutput(() => printReport(results)));
      expect(out).toContain("TODO OK");
      expect(out).toContain("[fixed]");
      for (const r of fixedChecks) {
        expect(out).not.toContain(`ACCIÓN REQUERIDA\n  ✗ ${r.name}`);
      }
    }), { numRuns: 100 });
  });

  it("P8: partición completa — ningún check se pierde", () => {
    fc.assert(fc.property(arbResults, (results) => {
      const out = strip(captureOutput(() => printReport(results)));
      for (const r of results) {
        expect(out).toContain(r.name);
      }
    }), { numRuns: 100 });
  });
});

// ── Unit tests ────────────────────────────────────────────────────

describe("printReport — unit tests", () => {
  it("omite ACCIÓN REQUERIDA cuando no hay errores", () => {
    const results: CheckResult[] = [{ name: "pnpm", status: "ok", message: "ok" }];
    const out = captureOutput(() => printReport(results));
    expect(out).not.toContain("ACCIÓN REQUERIDA");
  });

  it("checks fixed aparecen en TODO OK con badge [fixed]", () => {
    const results: CheckResult[] = [
      { name: ".npmrc", status: "error", message: "faltan reglas", wasFixed: true },
    ];
    const out = strip(captureOutput(() => printReport(results)));
    expect(out).not.toContain("ACCIÓN REQUERIDA");
    expect(out).toContain("TODO OK");
    expect(out).toContain("[fixed]");
  });

  it("hints aparecen inline, no al final del output", () => {
    const results: CheckResult[] = [
      { name: "renovate.json", status: "warn", message: "no encontrado", hint: ["Paso 1: $ locksmith --fix"] },
    ];
    const lines = captureOutput(() => printReport(results)).split("\n");
    const checkIdx = lines.findIndex(l => strip(l).includes("renovate.json") && !strip(l).includes("──"));
    const hintIdx  = lines.findIndex(l => l.includes("Paso 1"));
    expect(checkIdx).toBeGreaterThan(-1);
    expect(hintIdx).toBe(checkIdx + 1);
  });

  it("array vacío no lanza error", () => {
    expect(() => captureOutput(() => printReport([]))).not.toThrow();
  });

  it("array vacío muestra 0 ok", () => {
    const out = strip(captureOutput(() => printReport([])));
    expect(out).toContain("0 ok");
  });

  it("todos los checks fixed → TODO OK con todos los badges, sin error/warn sections", () => {
    const results: CheckResult[] = [
      { name: "a", status: "error", message: "e", wasFixed: true },
      { name: "b", status: "warn",  message: "w", wasFixed: true },
    ];
    const out = strip(captureOutput(() => printReport(results)));
    expect(out).not.toContain("ACCIÓN REQUERIDA");
    expect(out).not.toContain("ADVERTENCIAS");
    expect(out).toContain("TODO OK");
    expect(out).toContain("a");
    expect(out).toContain("b");
    const fixedCount = (out.match(/\[fixed\]/g) || []).length;
    expect(fixedCount).toBe(2);
  });

  it("ningún check fixable → no aparece locksmith . --fix", () => {
    const results: CheckResult[] = [
      { name: "a", status: "error", message: "e", fixable: false },
      { name: "b", status: "warn",  message: "w", fixable: false },
    ];
    const out = captureOutput(() => printReport(results));
    expect(out).not.toContain("locksmith . --fix");
  });

  it("formato exacto del header de sección incluye separador ──", () => {
    const results: CheckResult[] = [
      { name: "x", status: "error", message: "err" },
    ];
    const out = captureOutput(() => printReport(results));
    expect(out).toContain("──");
    expect(out).toContain("ACCIÓN REQUERIDA");
  });

  it("executive summary omite zeros correctamente", () => {
    const results: CheckResult[] = [
      { name: "a", status: "error", message: "e" },
      { name: "b", status: "ok",    message: "o" },
    ];
    const out = strip(captureOutput(() => printReport(results)));
    expect(out).not.toContain("advertencia");
    expect(out).toContain("1 error");
    expect(out).toContain("1 ok");
  });
});
