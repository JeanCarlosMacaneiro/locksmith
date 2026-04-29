import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { evaluateQualityGate } from "../../src/docker/quality-gate";
import type { DockerIssue, DockerSeverity } from "../../src/types";

const PBT_CONFIG = { numRuns: 100 };

const severities: DockerSeverity[] = ["critical", "high", "medium", "low", "info"];

function order(sev: DockerSeverity): number {
  if (sev === "info") return 0;
  if (sev === "low") return 1;
  if (sev === "medium") return 2;
  if (sev === "high") return 3;
  return 4;
}

describe("docker-security-layer — quality gate", () => {
  it("Property 18: Quality gate evalúa correctamente el umbral de severidad", () => {
    const arbIssue = fc.record({
      line: fc.integer({ min: 1, max: 50 }),
      kind: fc.constantFrom("pin-version", "missing-flag", "missing-copy", "missing-cmd", "update-from", "advisory"),
      description: fc.string({ minLength: 1 }),
      original: fc.string(),
      replacement: fc.constant(null),
      severity: fc.constantFrom(...severities),
    }) satisfies fc.Arbitrary<DockerIssue>;

    fc.assert(
      fc.property(fc.array(arbIssue, { maxLength: 30 }), fc.constantFrom("critical", "high", "medium", "low", "none"), (issues, failOn) => {
        const { qualityGatePassed } = evaluateQualityGate(issues, failOn);
        if (failOn === "none") {
          expect(qualityGatePassed).toBe(true);
          return;
        }
        const threshold = order(failOn);
        const expected = !issues.some((i) => order(i.severity ?? "info") >= threshold);
        expect(qualityGatePassed).toBe(expected);
      }),
      PBT_CONFIG,
    );
  });

  it("Property 19: qualityGateSummary cuenta correctamente por severidad", () => {
    const arbIssue = fc.record({
      line: fc.integer({ min: 1, max: 50 }),
      kind: fc.constantFrom("pin-version", "missing-flag", "missing-copy", "missing-cmd", "update-from", "advisory"),
      description: fc.string({ minLength: 1 }),
      original: fc.string(),
      replacement: fc.constant(null),
      severity: fc.constantFrom(...severities),
    }) satisfies fc.Arbitrary<DockerIssue>;

    fc.assert(
      fc.property(fc.array(arbIssue, { maxLength: 50 }), (issues) => {
        const { qualityGateSummary } = evaluateQualityGate(issues, "high");
        for (const s of severities) {
          const expected = issues.filter((i) => (i.severity ?? "info") === s).length;
          expect(qualityGateSummary[s]).toBe(expected);
        }
      }),
      PBT_CONFIG,
    );
  });
});

