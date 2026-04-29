import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { parseDockerSecurityReport } from "../../src/docker/serialization";
import type { DockerSecurityReport } from "../../src/types";

const PBT_CONFIG = { numRuns: 100 };

describe("docker-security-layer — serialization", () => {
  it("Property 21: Serialización round-trip de DockerSecurityReport", () => {
    const arbIssue = fc.record({
      line: fc.integer({ min: 1, max: 200 }),
      kind: fc.constantFrom("pin-version", "missing-flag", "missing-copy", "missing-cmd", "update-from", "advisory"),
      description: fc.string({ minLength: 1 }),
      original: fc.string(),
      replacement: fc.option(fc.string(), { nil: null }),
      severity: fc.option(fc.constantFrom("critical", "high", "medium", "low", "info"), { nil: undefined }),
      remediationGuide: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      source: fc.option(fc.constantFrom("internal", "hadolint", "trivy", "docker-scout"), { nil: undefined }),
      cveId: fc.option(fc.string({ minLength: 5 }), { nil: undefined }),
      hadolintCode: fc.option(fc.string({ minLength: 4 }), { nil: undefined }),
    });

    const arbReport = fc.record({
      found: fc.boolean(),
      dockerfilePath: fc.option(fc.string(), { nil: null }),
      issues: fc.array(arbIssue, { maxLength: 50 }),
      issueCount: fc.integer({ min: 0, max: 50 }),
      hasFixableIssues: fc.boolean(),
      qualityGatePassed: fc.boolean(),
      qualityGateSummary: fc.record({
        critical: fc.integer({ min: 0, max: 50 }),
        high: fc.integer({ min: 0, max: 50 }),
        medium: fc.integer({ min: 0, max: 50 }),
        low: fc.integer({ min: 0, max: 50 }),
        info: fc.integer({ min: 0, max: 50 }),
      }),
      internalChecksRan: fc.constant(true),
      scanners: fc.array(fc.record({
        name: fc.string({ minLength: 1 }),
        status: fc.constantFrom("ok", "skipped", "unavailable", "error"),
        issuesFound: fc.integer({ min: 0, max: 50 }),
      }), { maxLength: 5 }),
      llmFixInstructions: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    }) satisfies fc.Arbitrary<DockerSecurityReport>;

    fc.assert(
      fc.property(arbReport, (report) => {
        const json = JSON.stringify(report);
        const parsed = parseDockerSecurityReport(json);
        expect("error" in parsed).toBe(false);
        const roundTrip = JSON.stringify(JSON.parse(JSON.stringify(parsed)));
        expect(roundTrip).toBe(JSON.stringify(parsed));
      }),
      PBT_CONFIG,
    );
  });
});

