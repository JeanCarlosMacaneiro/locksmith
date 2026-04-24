import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registerClient, CLIENTS } from "../../bin/register-mcp";

const ROOT = join(import.meta.dir, "../..");

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "locksmith-rmc-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("registerClient — registro de clientes AI", () => {
  it("registro básico: crea JSON correcto en directorio temporal", async () => {
    const client = CLIENTS.find((c) => c.id === "cursor")!;
    await registerClient(client, "/fake/mcp.ts", ROOT, "linux", { HOME: tmpDir });

    const configPath = join(tmpDir, ".cursor/mcp.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.mcpServers?.locksmith).toEqual({
      command: "bun",
      args: ["/fake/mcp.ts"],
    });
  });

  it("registro idempotente: segunda ejecución no duplica la entrada locksmith", async () => {
    const client = CLIENTS.find((c) => c.id === "cursor")!;
    const env = { HOME: tmpDir };

    await registerClient(client, "/fake/mcp.ts", ROOT, "linux", env);
    await registerClient(client, "/fake/mcp.ts", ROOT, "linux", env);

    const configPath = join(tmpDir, ".cursor/mcp.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const serverKeys = Object.keys(config.mcpServers ?? {});
    expect(serverKeys.filter((k) => k === "locksmith").length).toBe(1);
  });

  it("JSON malformado: backup creado, archivo recreado, registro exitoso", async () => {
    const client = CLIENTS.find((c) => c.id === "cursor")!;
    const configDir = join(tmpDir, ".cursor");
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "mcp.json");
    writeFileSync(configPath, "{ invalid json {{{{");

    await registerClient(client, "/fake/mcp.ts", ROOT, "linux", { HOME: tmpDir });

    expect(existsSync(configPath + ".bak")).toBe(true);
    expect(readFileSync(configPath + ".bak", "utf-8")).toBe("{ invalid json {{{{");

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.mcpServers?.locksmith?.command).toBe("bun");
  });

  it("preserva claves existentes al registrar", async () => {
    const client = CLIENTS.find((c) => c.id === "cursor")!;
    const configDir = join(tmpDir, ".cursor");
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "mcp.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        someKey: "someValue",
        mcpServers: { otherTool: { command: "node", args: [] } },
      })
    );

    await registerClient(client, "/fake/mcp.ts", ROOT, "linux", { HOME: tmpDir });

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.someKey).toBe("someValue");
    expect(config.mcpServers?.otherTool).toEqual({ command: "node", args: [] });
    expect(config.mcpServers?.locksmith?.command).toBe("bun");
  });

  it("cliente con skillMode 'copy-file' (Kiro): copia skill al destino", async () => {
    const client = CLIENTS.find((c) => c.id === "kiro")!;
    await registerClient(client, "/fake/mcp.ts", ROOT, "darwin", { HOME: tmpDir });

    const skillDest = join(tmpDir, ".kiro/steering/locksmith.md");
    expect(existsSync(skillDest)).toBe(true);

    const content = readFileSync(skillDest, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("cliente con skillMode 'copy-file': segunda ejecución no sobreescribe skill", async () => {
    const client = CLIENTS.find((c) => c.id === "kiro")!;
    const env = { HOME: tmpDir };

    await registerClient(client, "/fake/mcp.ts", ROOT, "darwin", env);

    const skillDest = join(tmpDir, ".kiro/steering/locksmith.md");
    writeFileSync(skillDest, "contenido personalizado");

    await registerClient(client, "/fake/mcp.ts", ROOT, "darwin", env);

    expect(readFileSync(skillDest, "utf-8")).toBe("contenido personalizado");
  });

  it("cliente con skillMode 'append-to-file' (Claude Desktop): añade skill a CLAUDE.md", async () => {
    const client = CLIENTS.find((c) => c.id === "claude-desktop")!;
    await registerClient(client, "/fake/mcp.ts", ROOT, "darwin", { HOME: tmpDir });

    const skillDest = join(tmpDir, ".claude/CLAUDE.md");
    expect(existsSync(skillDest)).toBe(true);

    const content = readFileSync(skillDest, "utf-8");
    expect(content).toContain("locksmith — AI rules");
  });

  it("cliente con skillMode 'append-to-file': no duplica si ya existe el marcador", async () => {
    const client = CLIENTS.find((c) => c.id === "claude-desktop")!;
    const env = { HOME: tmpDir };

    await registerClient(client, "/fake/mcp.ts", ROOT, "darwin", env);
    await registerClient(client, "/fake/mcp.ts", ROOT, "darwin", env);

    const skillDest = join(tmpDir, ".claude/CLAUDE.md");
    const content = readFileSync(skillDest, "utf-8");
    const count = (content.match(/locksmith — AI rules/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("cliente con skillMode 'append-to-file': preserva contenido existente en CLAUDE.md", async () => {
    const client = CLIENTS.find((c) => c.id === "claude-desktop")!;
    const claudeMd = join(tmpDir, ".claude/CLAUDE.md");
    mkdirSync(join(tmpDir, ".claude"), { recursive: true });
    writeFileSync(claudeMd, "# Mis instrucciones existentes\n");

    await registerClient(client, "/fake/mcp.ts", ROOT, "darwin", { HOME: tmpDir });

    const content = readFileSync(claudeMd, "utf-8");
    expect(content).toContain("# Mis instrucciones existentes");
    expect(content).toContain("locksmith — AI rules");
  });

  it("cliente con configPath null (Trae): solo imprime hint, no crea archivos", async () => {
    const client = CLIENTS.find((c) => c.id === "trae")!;
    await registerClient(client, "/fake/mcp.ts", ROOT, "darwin", { HOME: tmpDir });

    expect(existsSync(join(tmpDir, ".trae"))).toBe(false);
    expect(existsSync(join(tmpDir, ".cursor"))).toBe(false);
  });

  it("cliente con configPath null (Copilot): no crea archivos", async () => {
    const client = CLIENTS.find((c) => c.id === "copilot")!;
    await registerClient(client, "/fake/mcp.ts", ROOT, "linux", { HOME: tmpDir });

    expect(existsSync(join(tmpDir, ".github"))).toBe(false);
  });

  it("crea directorios anidados si no existen", async () => {
    const client = CLIENTS.find((c) => c.id === "windsurf")!;
    await registerClient(client, "/fake/mcp.ts", ROOT, "darwin", { HOME: tmpDir });

    const configPath = join(tmpDir, ".codeium/windsurf/mcp_config.json");
    expect(existsSync(configPath)).toBe(true);
  });
});
