import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import fc from "fast-check";
import { analyzeDockerfile } from "../../src/docker/analyze-dockerfile";

const PBT_CONFIG = { numRuns: 100 };

describe("docker-security-layer — remediationGuide", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "locksmith-remediation-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "1.0.0", packageManager: "pnpm@10.25.0" }), "utf-8");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("Property 14: Todos los DockerIssues tienen remediationGuide no vacío", () => {
    const dockerfile = [
      "FROM node:latest",
      "WORKDIR /app",
      "COPY . .",
      "RUN npm install -g pnpm",
      "RUN pnpm install",
      "CMD [\"node\", \"index.js\"]",
    ].join("\n");
    writeFileSync(join(dir, "Dockerfile"), dockerfile, "utf-8");

    const analyses = analyzeDockerfile(dir, "node");
    const issues = analyses[0]!.issues;
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) {
      expect(typeof i.remediationGuide).toBe("string");
      expect((i.remediationGuide ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("Property 15: Issues con replacement incluyen código en remediationGuide", () => {
    fc.assert(
      fc.property(fc.string(), (workdir) => {
        const wd = workdir.replace(/\s+/g, "").slice(0, 8) || "app";
        const dockerfile = [
          "FROM node:latest",
          `WORKDIR /${wd}`,
          "RUN npm install -g pnpm",
          "RUN pnpm install",
          "CMD [\"node\", \"index.js\"]",
        ].join("\n");
        writeFileSync(join(dir, "Dockerfile"), dockerfile, "utf-8");

        const analyses = analyzeDockerfile(dir, "node");
        const issues = analyses[0]!.issues.filter((i) => i.replacement !== null && !i.original.startsWith(".dockerignore"));
        expect(issues.length).toBeGreaterThan(0);
        for (const i of issues) {
          expect(i.remediationGuide ?? "").toContain(i.replacement!);
        }
      }),
      PBT_CONFIG,
    );
  });
});

