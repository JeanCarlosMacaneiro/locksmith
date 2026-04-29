import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { checkUserDirective } from "../../src/docker/check-user-directive";

const PBT_CONFIG = { numRuns: 100 };

describe("docker-security-layer — check-user-directive", () => {
  it("Property 9: Detección de contenedor corriendo como root", () => {
    fc.assert(
      fc.property(fc.boolean(), (explicitRoot) => {
        const lines = [
          "FROM alpine",
          explicitRoot ? "USER root" : "RUN echo ok",
          "CMD [\"sh\", \"-c\", \"echo hi\"]",
        ];
        const issues = checkUserDirective(lines);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]?.severity).toBe("high");
      }),
      PBT_CONFIG,
    );
  });

  it("Property 10: USER no-root suprime advisory de USER directive", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s !== "root" && s !== "0" && !/\s/.test(s)),
        (user) => {
          const lines = [
            "FROM alpine",
            `USER ${user}`,
            "CMD [\"sh\"]",
          ];
          const issues = checkUserDirective(lines);
          expect(issues.length).toBe(0);
        },
      ),
      PBT_CONFIG,
    );
  });
});

