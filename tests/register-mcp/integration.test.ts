import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { main } from "../../bin/register-mcp";

const ROOT = join(import.meta.dir, "../..");

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "locksmith-int-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Integration — main()", () => {
  it("selectedIndices=[0] (Claude Desktop) en darwin → config creado con estructura correcta", async () => {
    await main({
      interactive: true,
      selectedIndices: [0],
      scriptDir: ROOT,
      platform: "darwin",
      env: { HOME: tmpDir },
    });

    const configPath = join(
      tmpDir,
      "Library/Application Support/Claude/claude_desktop_config.json"
    );
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.mcpServers?.locksmith?.command).toBe("bun");
    expect(Array.isArray(config.mcpServers?.locksmith?.args)).toBe(true);
  });

  it("selectedIndices=[0] (Claude Desktop) en darwin → skill añadido a CLAUDE.md", async () => {
    await main({
      interactive: true,
      selectedIndices: [0],
      scriptDir: ROOT,
      platform: "darwin",
      env: { HOME: tmpDir },
    });

    const claudeMd = join(tmpDir, ".claude/CLAUDE.md");
    expect(existsSync(claudeMd)).toBe(true);
    expect(readFileSync(claudeMd, "utf-8")).toContain("locksmith — AI rules");
  });

  it("selectedIndices=[4] (Kiro) en linux → config y skill creados", async () => {
    await main({
      interactive: true,
      selectedIndices: [4],
      scriptDir: ROOT,
      platform: "linux",
      env: { HOME: tmpDir },
    });

    const configPath = join(tmpDir, ".kiro/settings/mcp.json");
    const skillPath = join(tmpDir, ".kiro/steering/locksmith.md");
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(skillPath)).toBe(true);
  });

  it("interactive=false → no se crea ningún archivo", async () => {
    await main({
      interactive: false,
      scriptDir: ROOT,
      env: { HOME: tmpDir },
    });

    expect(existsSync(join(tmpDir, "Library"))).toBe(false);
    expect(existsSync(join(tmpDir, ".cursor"))).toBe(false);
    expect(existsSync(join(tmpDir, ".kiro"))).toBe(false);
  });

  it("selectedIndices=[] (ninguno seleccionado) → no se crea ningún archivo", async () => {
    await main({
      interactive: true,
      selectedIndices: [],
      scriptDir: ROOT,
      platform: "darwin",
      env: { HOME: tmpDir },
    });

    expect(existsSync(join(tmpDir, "Library"))).toBe(false);
    expect(existsSync(join(tmpDir, ".cursor"))).toBe(false);
  });

  it("múltiples clientes seleccionados → todos registrados", async () => {
    await main({
      interactive: true,
      selectedIndices: [1, 2],
      scriptDir: ROOT,
      platform: "linux",
      env: { HOME: tmpDir },
    });

    expect(existsSync(join(tmpDir, ".cursor/mcp.json"))).toBe(true);
    expect(existsSync(join(tmpDir, ".codeium/windsurf/mcp_config.json"))).toBe(true);
  });

  it("CI=true via subprocess → exit 0 sin archivos creados", async () => {
    const proc = Bun.spawn(["bun", join(ROOT, "bin/register-mcp.ts")], {
      env: { ...process.env, CI: "true", HOME: tmpDir },
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(existsSync(join(tmpDir, "Library"))).toBe(false);
  }, 15000);
});
