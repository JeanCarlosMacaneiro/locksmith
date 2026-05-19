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

describe("registerClient — AI client registration", () => {
  it("basic registration: creates correct JSON in temp directory", async () => {
    const client = CLIENTS.find((c) => c.id === "cursor")!;
    await registerClient(client, ROOT, ROOT, "linux", { HOME: tmpDir });

    const configPath = join(tmpDir, ".cursor/mcp.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const locksmith = config.mcpServers?.locksmith as { command: string; args?: string[] };
    expect(locksmith.command).toMatch(/(bun|mcp)$/);
    // compiled binary → no args; bun fallback → args contains mcp.ts
    if (locksmith.args !== undefined) {
      expect(locksmith.args[0]).toMatch(/mcp\.ts$/);
    }
  });

  it("idempotent: second run does not duplicate locksmith entry", async () => {
    const client = CLIENTS.find((c) => c.id === "cursor")!;
    const env = { HOME: tmpDir };

    await registerClient(client, ROOT, ROOT, "linux", env);
    await registerClient(client, ROOT, ROOT, "linux", env);

    const configPath = join(tmpDir, ".cursor/mcp.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const serverKeys = Object.keys(config.mcpServers ?? {});
    expect(serverKeys.filter((k) => k === "locksmith").length).toBe(1);
  });

  it("malformed JSON: backup created, file recreated, registration succeeds", async () => {
    const client = CLIENTS.find((c) => c.id === "cursor")!;
    const configDir = join(tmpDir, ".cursor");
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "mcp.json");
    writeFileSync(configPath, "{ invalid json {{{{");

    await registerClient(client, ROOT, ROOT, "linux", { HOME: tmpDir });

    expect(existsSync(configPath + ".bak")).toBe(true);
    expect(readFileSync(configPath + ".bak", "utf-8")).toBe("{ invalid json {{{{");

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.mcpServers?.locksmith?.command).toMatch(/(bun|mcp)$/);
  });

  it("preserves existing keys on registration", async () => {
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

    await registerClient(client, ROOT, ROOT, "linux", { HOME: tmpDir });

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.someKey).toBe("someValue");
    expect(config.mcpServers?.otherTool).toEqual({ command: "node", args: [] });
    expect(config.mcpServers?.locksmith?.command).toMatch(/(bun|mcp)$/);
  });

  it("skillMode 'copy-file' (Kiro): copies skill to destination", async () => {
    const client = CLIENTS.find((c) => c.id === "kiro")!;
    await registerClient(client, ROOT, ROOT, "darwin", { HOME: tmpDir });

    const skillDest = join(tmpDir, ".kiro/steering/locksmith.md");
    expect(existsSync(skillDest)).toBe(true);

    const content = readFileSync(skillDest, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("skillMode 'copy-file': second run does not overwrite skill", async () => {
    const client = CLIENTS.find((c) => c.id === "kiro")!;
    const env = { HOME: tmpDir };

    await registerClient(client, ROOT, ROOT, "darwin", env);

    const skillDest = join(tmpDir, ".kiro/steering/locksmith.md");
    writeFileSync(skillDest, "custom content");

    await registerClient(client, ROOT, ROOT, "darwin", env);

    expect(readFileSync(skillDest, "utf-8")).toBe("custom content");
  });

  it("skillMode 'append-to-file' (Claude Desktop): adds skill to CLAUDE.md", async () => {
    const client = CLIENTS.find((c) => c.id === "claude-desktop")!;
    await registerClient(client, ROOT, ROOT, "darwin", { HOME: tmpDir });

    const skillDest = join(tmpDir, ".claude/CLAUDE.md");
    expect(existsSync(skillDest)).toBe(true);

    const content = readFileSync(skillDest, "utf-8");
    expect(content).toContain("locksmith — AI rules");
  });

  it("skillMode 'append-to-file': does not duplicate if marker already exists", async () => {
    const client = CLIENTS.find((c) => c.id === "claude-desktop")!;
    const env = { HOME: tmpDir };

    await registerClient(client, ROOT, ROOT, "darwin", env);
    await registerClient(client, ROOT, ROOT, "darwin", env);

    const skillDest = join(tmpDir, ".claude/CLAUDE.md");
    const content = readFileSync(skillDest, "utf-8");
    const count = (content.match(/locksmith — AI rules/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("skillMode 'append-to-file': preserves existing CLAUDE.md content", async () => {
    const client = CLIENTS.find((c) => c.id === "claude-desktop")!;
    const claudeMd = join(tmpDir, ".claude/CLAUDE.md");
    mkdirSync(join(tmpDir, ".claude"), { recursive: true });
    writeFileSync(claudeMd, "# My existing instructions\n");

    await registerClient(client, ROOT, ROOT, "darwin", { HOME: tmpDir });

    const content = readFileSync(claudeMd, "utf-8");
    expect(content).toContain("# My existing instructions");
    expect(content).toContain("locksmith — AI rules");
  });

  it("creates nested directories if they do not exist", async () => {
    const client = CLIENTS.find((c) => c.id === "windsurf")!;
    await registerClient(client, ROOT, ROOT, "darwin", { HOME: tmpDir });

    const configPath = join(tmpDir, ".codeium/windsurf/mcp_config.json");
    expect(existsSync(configPath)).toBe(true);
  });

  it("configFormat 'zed': writes context_servers format", async () => {
    const client = CLIENTS.find((c) => c.id === "zed")!;
    await registerClient(client, ROOT, ROOT, "linux", { HOME: tmpDir });

    const configPath = join(tmpDir, ".config/zed/settings.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf-8")) as any;
    expect(config.context_servers?.locksmith?.command?.path).toMatch(/(bun|mcp)$/);
    // compiled binary → no args key; bun fallback → args contains mcp.ts
    const zedArgs = config.context_servers?.locksmith?.command?.args;
    if (zedArgs !== undefined) {
      expect(zedArgs[0]).toMatch(/mcp\.ts$/);
    }
    expect(config.mcpServers).toBeUndefined();
  });

  it("configFormat 'zed': idempotent — does not duplicate entry", async () => {
    const client = CLIENTS.find((c) => c.id === "zed")!;
    const env = { HOME: tmpDir };

    await registerClient(client, ROOT, ROOT, "linux", env);
    await registerClient(client, ROOT, ROOT, "linux", env);

    const config = JSON.parse(readFileSync(join(tmpDir, ".config/zed/settings.json"), "utf-8")) as any;
    const keys = Object.keys(config.context_servers ?? {});
    expect(keys.filter((k) => k === "locksmith").length).toBe(1);
  });

  it("configFormat 'zed': preserves existing context_servers", async () => {
    const configDir = join(tmpDir, ".config/zed");
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "settings.json");
    writeFileSync(configPath, JSON.stringify({
      context_servers: { other: { command: { path: "node", args: [] } } },
      theme: "dark",
    }, null, 2));

    const client = CLIENTS.find((c) => c.id === "zed")!;
    await registerClient(client, ROOT, ROOT, "linux", { HOME: tmpDir });

    const config = JSON.parse(readFileSync(configPath, "utf-8")) as any;
    expect(config.theme).toBe("dark");
    expect(config.context_servers?.other).toBeDefined();
    expect(config.context_servers?.locksmith?.command?.path).toMatch(/(bun|mcp)$/);
  });

  it("configFormat 'continue': writes array mcpServers format", async () => {
    const client = CLIENTS.find((c) => c.id === "continue")!;
    await registerClient(client, ROOT, ROOT, "linux", { HOME: tmpDir });

    const configPath = join(tmpDir, ".continue/config.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf-8")) as any;
    expect(Array.isArray(config.mcpServers)).toBe(true);
    const entry = config.mcpServers.find((s: any) => s.name === "locksmith");
    expect(entry?.command).toMatch(/(bun|mcp)$/);
    // compiled binary → no args key; bun fallback → args contains mcp.ts
    if (entry?.args !== undefined) {
      expect(entry.args[0]).toMatch(/mcp\.ts$/);
    }
  });

  it("configFormat 'continue': idempotent — does not duplicate entry", async () => {
    const client = CLIENTS.find((c) => c.id === "continue")!;
    const env = { HOME: tmpDir };

    await registerClient(client, ROOT, ROOT, "linux", env);
    await registerClient(client, ROOT, ROOT, "linux", env);

    const config = JSON.parse(readFileSync(join(tmpDir, ".continue/config.json"), "utf-8")) as any;
    const count = (config.mcpServers as any[]).filter((s: any) => s.name === "locksmith").length;
    expect(count).toBe(1);
  });

  it("configFormat 'codex-toml': writes TOML to ~/.codex/config.toml", async () => {
    const client = CLIENTS.find((c) => c.id === "codex")!;
    await registerClient(client, ROOT, ROOT, "linux", { HOME: tmpDir });

    const configPath = join(tmpDir, ".codex/config.toml");
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("[mcp_servers.locksmith]");
    expect(content).toMatch(/command\s*=\s*"/);
  });

  it("configFormat 'codex-toml': idempotent — single section after two runs", async () => {
    const client = CLIENTS.find((c) => c.id === "codex")!;
    const env = { HOME: tmpDir };

    await registerClient(client, ROOT, ROOT, "linux", env);
    await registerClient(client, ROOT, ROOT, "linux", env);

    const content = readFileSync(join(tmpDir, ".codex/config.toml"), "utf-8");
    const count = (content.match(/\[mcp_servers\.locksmith\]/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("configFormat 'codex-toml': preserves existing TOML sections", async () => {
    const client = CLIENTS.find((c) => c.id === "codex")!;
    const configDir = join(tmpDir, ".codex");
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "config.toml");
    writeFileSync(configPath, `[mcp_servers.other]\ncommand = "node"\n`);

    await registerClient(client, ROOT, ROOT, "linux", { HOME: tmpDir });

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("[mcp_servers.other]");
    expect(content).toContain("[mcp_servers.locksmith]");
  });
});
