import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { checkLayerCache } from "../../src/docker/check-layer-cache";

const PBT_CONFIG = { numRuns: 100 };

describe("docker-security-layer — check-layer-cache", () => {
  it("Property 4: Detección de layer caching ineficiente", () => {
    fc.assert(
      fc.property(fc.constantFrom("node", "bun", "python"), (projectType) => {
        const install = projectType === "python" ? "RUN pip install -r requirements.txt" : "RUN pnpm install";
        const lines = ["FROM alpine", "COPY . .", install, "CMD [\"sh\"]"];
        const issues = checkLayerCache(lines, projectType);
        const caching = issues.find((i) => i.kind === "advisory" && i.severity === "medium");
        expect(caching).toBeTruthy();
      }),
      PBT_CONFIG,
    );
  });

  it("Property 5: Detección de apt-get sin cleanup (en check-layer-cache)", () => {
    const lines = ["FROM debian:bookworm", "RUN apt-get update && apt-get install -y curl", "CMD [\"sh\"]"];
    const issues = checkLayerCache(lines, "unknown");
    const apt = issues.find((i) => i.kind === "missing-flag" && i.severity === "medium");
    expect(apt).toBeTruthy();
  });
});

