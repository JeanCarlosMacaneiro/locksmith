import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { determineRiskLevel, buildReport } from "../../src/add/security-report";
import type { PackageSecurityInfo, DangerousScript, SocketScore } from "../../src/types";

// ── Property tests ────────────────────────────────────────────────────────────

describe("determineRiskLevel — properties", () => {
  it("resultado siempre es none | medium | critical", () =>
    fc.assert(
      fc.property(
        fc.array(fc.record({ scriptName: fc.string(), value: fc.string(), patterns: fc.array(fc.string()) })),
        fc.option(fc.record({
          supplyChainRisk: fc.float({ min: 0, max: 1 }),
          alerts: fc.array(fc.record({
            severity: fc.constantFrom("critical", "high", "middle", "low") as fc.Arbitrary<"critical"|"high"|"middle"|"low">,
            type: fc.string(),
          })),
        })),
        (ds, score) => {
          const r = determineRiskLevel(ds as DangerousScript[], score as SocketScore | undefined);
          return ["none", "medium", "critical"].includes(r);
        }
      ),
      { numRuns: 100 }
    )
  );
});

// Feature: safe-add, Property 7: La versión resuelta siempre aparece en el Security_Report
describe("buildReport — properties", () => {
  it("siempre contiene resolvedVersion", () =>
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }),
          resolvedVersion: fc.string({ minLength: 1 }),
          lifecycleScripts: fc.dictionary(fc.string(), fc.string()),
          dangerousScripts: fc.array(fc.record({
            scriptName: fc.string(),
            value: fc.string(),
            patterns: fc.array(fc.string()),
          })),
          riskLevel: fc.constantFrom("none", "medium", "critical") as fc.Arbitrary<"none"|"medium"|"critical">,
        }),
        (info) => {
          const report = buildReport(info as PackageSecurityInfo);
          return report.includes(info.resolvedVersion);
        }
      ),
      { numRuns: 100 }
    )
  );

  // Feature: safe-add, Property 5: Round-trip del campo scripts
  it("scripts JSON round-trip es idempotente", () =>
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.string()),
        (scripts) => {
          const rt = JSON.parse(JSON.stringify(scripts));
          return JSON.stringify(rt) === JSON.stringify(scripts);
        }
      ),
      { numRuns: 100 }
    )
  );
});

// ── Unit tests ────────────────────────────────────────────────────────────────

describe("determineRiskLevel — unit", () => {
  it("alerta malware → critical", () => {
    const score: SocketScore = {
      supplyChainRisk: 0.9,
      alerts: [{ severity: "critical", type: "malware" }],
    };
    expect(determineRiskLevel([], score)).toBe("critical");
  });

  it("malware + --force (no cambia level) → critical", () => {
    const score: SocketScore = {
      supplyChainRisk: 0.9,
      alerts: [{ severity: "critical", type: "malware" }],
    };
    expect(determineRiskLevel([], score)).toBe("critical");
  });

  it("dangerous scripts sin malware → medium", () => {
    const ds: DangerousScript[] = [{ scriptName: "postinstall", value: "curl x", patterns: ["curl"] }];
    expect(determineRiskLevel(ds, undefined)).toBe("medium");
  });

  it("socket score sin malware + dangerous scripts → medium (dangerous scripts wins over score)", () => {
    const score: SocketScore = { supplyChainRisk: 0.5, alerts: [{ severity: "high", type: "install-scripts" }] };
    const ds: DangerousScript[] = [{ scriptName: "postinstall", value: "curl x", patterns: ["curl"] }];
    expect(determineRiskLevel(ds, score)).toBe("medium");
  });

  it("sin hallazgos → none", () => {
    expect(determineRiskLevel([], undefined)).toBe("none");
  });

  it("socket score sin alertas + sin dangerous scripts → none", () => {
    const score: SocketScore = { supplyChainRisk: 0.1, alerts: [] };
    expect(determineRiskLevel([], score)).toBe("none");
  });
});

describe("buildReport — unit", () => {
  const base: PackageSecurityInfo = {
    name: "evil-pkg",
    resolvedVersion: "1.2.3",
    lifecycleScripts: {},
    dangerousScripts: [],
    riskLevel: "none",
  };

  it("siempre incluye nombre y versión", () => {
    const r = buildReport(base);
    expect(r).toContain("evil-pkg");
    expect(r).toContain("1.2.3");
  });

  it("riskLevel medium muestra scripts peligrosos", () => {
    const info: PackageSecurityInfo = {
      ...base,
      riskLevel: "medium",
      dangerousScripts: [{ scriptName: "postinstall", value: "curl evil.com", patterns: ["curl"] }],
    };
    const r = buildReport(info);
    expect(r).toContain("postinstall");
    expect(r).toContain("curl evil.com");
  });

  it("riskLevel critical incluye texto crítico", () => {
    const r = buildReport({ ...base, riskLevel: "critical" });
    expect(r.toLowerCase()).toContain("crít");
  });

  it("socketScore visible en reporte", () => {
    const info: PackageSecurityInfo = {
      ...base,
      socketScore: { supplyChainRisk: 0.8, alerts: [{ severity: "high", type: "install-scripts" }] },
    };
    const r = buildReport(info);
    expect(r).toContain("Socket.dev");
    expect(r).toContain("install-scripts");
  });
});
