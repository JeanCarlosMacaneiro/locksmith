import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { checkAptCleanup } from "../../src/docker/check-apt-cleanup";

const PBT_CONFIG = { numRuns: 100 };

describe("docker-security-layer — check-apt-cleanup", () => {
  it("Property 5: Detección de apt-get sin cleanup", () => {
    fc.assert(
      fc.property(fc.string(), (pkg) => {
        const safePkg = pkg.replace(/\s+/g, "").slice(0, 10) || "curl";
        const lines = [
          "FROM debian:bookworm",
          `RUN apt-get update && apt-get install -y ${safePkg}`,
          "CMD [\"sh\"]",
        ];
        const issues = checkAptCleanup(lines);
        expect(issues.some((i) => i.kind === "missing-flag" && i.severity === "medium")).toBe(true);
      }),
      PBT_CONFIG,
    );
  });
});

