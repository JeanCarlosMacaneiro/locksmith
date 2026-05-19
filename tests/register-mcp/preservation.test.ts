import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import fc from "fast-check";
import { buildMcpConfig } from "../../src/mcp/installer";

// Each test needs a temp locksmithRoot with dist/mcp so resolveMcpCommand picks compiled binary
let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "lk-pres-"));
  mkdirSync(join(tmpRoot, "dist"), { recursive: true });
  writeFileSync(join(tmpRoot, "dist", "mcp"), "#!/bin/sh\n", { mode: 0o755 });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("Preservation — buildMcpConfig", () => {
  describe("Observed base behavior (sin fix)", () => {
    it("buildMcpConfig(null, root) retorna estructura base con locksmith", () => {
      const result = buildMcpConfig(null, tmpRoot);
      const servers = result.mcpServers as Record<string, unknown>;
      const locksmith = servers.locksmith as { command: string; args?: string[] };
      expect(locksmith.command).toMatch(/mcp/);
      expect(locksmith.args).toBeUndefined(); // compiled binary — no args
    });

    it("buildMcpConfig(existingConfig, root) preserva todas las claves originales", () => {
      const existing = {
        someKey: "someValue",
        anotherKey: 42,
        mcpServers: { otherServer: { command: "node", args: ["server.js"] } },
      };
      const result = buildMcpConfig(existing, tmpRoot);
      expect(result.someKey).toBe("someValue");
      expect(result.anotherKey).toBe(42);
      const servers = result.mcpServers as Record<string, unknown>;
      expect(servers.otherServer).toEqual({ command: "node", args: ["server.js"] });
      expect((servers.locksmith as { command: string }).command).toMatch(/mcp/);
    });

    it("buildMcpConfig actualiza locksmith si ya existe en mcpServers", () => {
      const existing = {
        mcpServers: {
          locksmith: { command: "/old/bun", args: ["/old/mcp.ts"] },
        },
      };
      const result = buildMcpConfig(existing, tmpRoot);
      const servers = result.mcpServers as Record<string, unknown>;
      const locksmith = servers.locksmith as { command: string; args?: string[] };
      expect(locksmith.command).toMatch(/mcp/);
      expect(locksmith.args).toBeUndefined();
    });
  });

  describe("Property: preservación de claves arbitrarias", () => {
    it("para cualquier config existente, buildMcpConfig preserva todas las claves y añade locksmith", () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.string({ minLength: 1 }).filter((s) => s !== "mcpServers"),
            fc.oneof(fc.string(), fc.integer(), fc.boolean())
          ),
          (existingConfig) => {
            const result = buildMcpConfig(
              existingConfig as Record<string, unknown>,
              tmpRoot,
            );
            for (const key of Object.keys(existingConfig)) {
              expect(result[key]).toEqual(existingConfig[key]);
            }
            const servers = result.mcpServers as Record<string, unknown>;
            const locksmith = servers.locksmith as { command: string };
            expect(typeof locksmith.command).toBe("string");
            expect(locksmith.command.length).toBeGreaterThan(0);
          }
        )
      );
    });

    it("buildMcpConfig es idempotente: ejecutar dos veces produce el mismo resultado", () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.string({ minLength: 1 }).filter((s) => s !== "mcpServers"),
            fc.oneof(fc.string(), fc.integer(), fc.boolean())
          ),
          (existingConfig) => {
            const first = buildMcpConfig(existingConfig as Record<string, unknown>, tmpRoot);
            const second = buildMcpConfig(first, tmpRoot);
            expect(JSON.stringify(second)).toBe(JSON.stringify(first));
          }
        )
      );
    });
  });
});
