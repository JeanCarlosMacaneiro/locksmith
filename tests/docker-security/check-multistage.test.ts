import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { checkMultistage } from "../../src/docker/check-multistage";

const PBT_CONFIG = { numRuns: 100 };

describe("docker-security-layer — check-multistage", () => {
  it("Property 7: Detección de candidatos a multi-stage build", () => {
    fc.assert(
      fc.property(fc.constantFrom("node", "bun", "unknown"), (projectType) => {
        const lines = [
          "FROM node:20-alpine",
          "RUN pnpm install",
          "RUN pnpm run build",
          "CMD [\"node\", \"dist/index.js\"]",
        ];
        const issues = checkMultistage(lines, projectType);
        expect(issues.some((i) => i.kind === "advisory" && i.severity === "medium")).toBe(true);
      }),
      PBT_CONFIG,
    );
  });

  it("Property 8: Multi-stage Dockerfiles no generan advisory de multi-stage", () => {
    const lines = [
      "FROM node:20-alpine AS build",
      "RUN pnpm install && pnpm run build",
      "FROM node:20-alpine",
      "COPY --from=build /app/dist /app/dist",
      "CMD [\"node\", \"/app/dist/index.js\"]",
    ];
    const issues = checkMultistage(lines, "node");
    expect(issues.length).toBe(0);
  });
});

