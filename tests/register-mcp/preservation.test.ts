import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { buildMcpConfig } from "../../src/mcp/installer";

describe("Preservation — buildMcpConfig", () => {
  describe("Observed base behavior (sin fix)", () => {
    it("buildMcpConfig(null, path) retorna estructura base con locksmith", () => {
      const result = buildMcpConfig(null, "/path/to/mcp.ts");
      expect(result).toEqual({
        mcpServers: {
          locksmith: { command: "bun", args: ["/path/to/mcp.ts"] },
        },
      });
    });

    it("buildMcpConfig(existingConfig, path) preserva todas las claves originales", () => {
      const existing = {
        someKey: "someValue",
        anotherKey: 42,
        mcpServers: { otherServer: { command: "node", args: ["server.js"] } },
      };
      const result = buildMcpConfig(existing, "/path/to/mcp.ts");
      expect(result.someKey).toBe("someValue");
      expect(result.anotherKey).toBe(42);
      const servers = result.mcpServers as Record<string, unknown>;
      expect(servers.otherServer).toEqual({ command: "node", args: ["server.js"] });
      expect(servers.locksmith).toEqual({ command: "bun", args: ["/path/to/mcp.ts"] });
    });

    it("buildMcpConfig actualiza locksmith si ya existe en mcpServers", () => {
      const existing = {
        mcpServers: {
          locksmith: { command: "bun", args: ["/old/mcp.ts"] },
        },
      };
      const result = buildMcpConfig(existing, "/new/mcp.ts");
      const servers = result.mcpServers as Record<string, unknown>;
      expect((servers.locksmith as { args: string[] }).args).toEqual(["/new/mcp.ts"]);
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
              "/test/mcp.ts"
            );
            for (const key of Object.keys(existingConfig)) {
              expect(result[key]).toEqual(existingConfig[key]);
            }
            const servers = result.mcpServers as Record<string, unknown>;
            const locksmith = servers.locksmith as { command: string; args: string[] };
            expect(locksmith.command).toBe("bun");
            expect(locksmith.args).toEqual(["/test/mcp.ts"]);
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
            const path = "/idempotent/mcp.ts";
            const first = buildMcpConfig(existingConfig as Record<string, unknown>, path);
            const second = buildMcpConfig(first, path);
            expect(JSON.stringify(second)).toBe(JSON.stringify(first));
          }
        )
      );
    });
  });
});
