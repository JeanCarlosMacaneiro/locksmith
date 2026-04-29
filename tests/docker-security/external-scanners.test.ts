import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { mapHadolintCode, mapTrivySeverity, parseHadolintJson, parseTrivyJson } from "../../src/docker/external-scanners";

const PBT_CONFIG = { numRuns: 100 };

describe("docker-security-layer — external scanners mapping", () => {
  it("Property 1: Mapeo de reglas Hadolint preserva kind y severity", () => {
    fc.assert(
      fc.property(fc.constantFrom("DL3007", "DL3002", "DL3008", "DL3009"), (code) => {
        const mapped = mapHadolintCode(code);
        if (code === "DL3007") {
          expect(mapped.kind).toBe("pin-version");
          expect(mapped.severity).toBe("high");
        }
        if (code === "DL3002") {
          expect(mapped.kind).toBe("missing-cmd");
          expect(mapped.severity).toBe("high");
        }
        if (code === "DL3008" || code === "DL3009") {
          expect(mapped.kind).toBe("missing-flag");
          expect(mapped.severity).toBe("medium");
        }
      }),
      PBT_CONFIG,
    );
  });

  it("Property 2: Mapeo de severidad Trivy es correcto", () => {
    fc.assert(
      fc.property(fc.constantFrom("CRITICAL", "HIGH", "MEDIUM", "LOW"), (sev) => {
        const mapped = mapTrivySeverity(sev);
        if (sev === "CRITICAL") expect(mapped).toBe("critical");
        if (sev === "HIGH") expect(mapped).toBe("high");
        if (sev === "MEDIUM") expect(mapped).toBe("medium");
        if (sev === "LOW") expect(mapped).toBe("low");
      }),
      PBT_CONFIG,
    );
  });

  it("Property 3: Deduplicación de CVEs por ID", () => {
    const out = {
      Results: [
        {
          Vulnerabilities: [
            { VulnerabilityID: "CVE-2024-0001", Severity: "HIGH", PkgName: "openssl", FixedVersion: "3.0.0" },
            { VulnerabilityID: "CVE-2024-0001", Severity: "HIGH", PkgName: "openssl", FixedVersion: "3.0.0" },
          ],
        },
      ],
    };
    const issues = parseTrivyJson(JSON.stringify(out));
    const ids = issues.map((i) => i.cveId).filter(Boolean);
    expect(ids).toEqual(["CVE-2024-0001"]);
  });

  it("Property 16: Issues de Hadolint incluyen código de regla en remediationGuide", () => {
    const dockerLines = ["FROM node:latest", "RUN echo ok"];
    const hadolintJson = JSON.stringify([{ code: "DL3007", message: "Using latest tag", line: 1 }]);
    const issues = parseHadolintJson(hadolintJson, dockerLines);
    expect(issues[0]?.remediationGuide ?? "").toContain("DL3007");
    expect(issues[0]?.remediationGuide ?? "").toContain("github.com/hadolint/hadolint/wiki/DL3007");
  });

  it("Property 17: Issues de Trivy incluyen CVE ID en remediationGuide", () => {
    const trivyJson = JSON.stringify({
      Results: [
        {
          Vulnerabilities: [
            { VulnerabilityID: "CVE-2024-1234", Severity: "CRITICAL", PkgName: "libssl", FixedVersion: "1.2.3" },
          ],
        },
      ],
    });
    const issues = parseTrivyJson(trivyJson);
    expect(issues[0]?.remediationGuide ?? "").toContain("CVE-2024-1234");
    expect(issues[0]?.remediationGuide ?? "").toContain("nvd.nist.gov/vuln/detail/CVE-2024-1234");
  });
});

