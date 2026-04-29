import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { installProjectMcp } from "../src/mcp/project-install";

const ROOT = join(import.meta.dir, "..");

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "locksmith-project-mcp-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("installProjectMcp", () => {
  it("creates Trae MCP config and per-project rules", async () => {
    const result = await installProjectMcp({ projectPath: projectDir, locksmithRoot: ROOT });

    expect(existsSync(join(projectDir, ".trae/mcp.json"))).toBe(true);
    expect(existsSync(join(projectDir, ".trae/rules/locksmith.md"))).toBe(true);
    expect(existsSync(join(projectDir, ".cursor/rules/locksmith.md"))).toBe(true);
    expect(existsSync(join(projectDir, ".windsurf/rules/locksmith.md"))).toBe(true);
    expect(existsSync(join(projectDir, ".clinerules/locksmith.md"))).toBe(true);
    expect(existsSync(join(projectDir, ".github/copilot-instructions.md"))).toBe(true);
    expect(existsSync(join(projectDir, "AGENTS.md"))).toBe(true);

    expect(result.created.length).toBeGreaterThan(0);

    const trae = JSON.parse(readFileSync(join(projectDir, ".trae/mcp.json"), "utf-8")) as any;
    expect(trae.mcpServers.locksmith.command).toBe("bun");
    expect(trae.mcpServers.locksmith.args[0]).toBe(join(ROOT, "bin", "mcp.ts"));
  });

  it("is idempotent and does not overwrite existing rule files", async () => {
    await installProjectMcp({ projectPath: projectDir, locksmithRoot: ROOT });

    const custom = "custom\n";
    const cursorRule = join(projectDir, ".cursor/rules/locksmith.md");
    writeFileSync(cursorRule, custom);

    const first = readFileSync(join(projectDir, ".trae/mcp.json"), "utf-8");
    const result = await installProjectMcp({ projectPath: projectDir, locksmithRoot: ROOT });
    const second = readFileSync(join(projectDir, ".trae/mcp.json"), "utf-8");

    expect(second).toBe(first);
    expect(readFileSync(cursorRule, "utf-8")).toBe(custom);
    expect(result.created.length).toBe(0);
  });

  it("supports installing a subset of targets", async () => {
    const result = await installProjectMcp({
      projectPath: projectDir,
      locksmithRoot: ROOT,
      targets: ["trae", "cursor"],
    });

    expect(existsSync(join(projectDir, ".trae/mcp.json"))).toBe(true);
    expect(existsSync(join(projectDir, ".trae/rules/locksmith.md"))).toBe(true);
    expect(existsSync(join(projectDir, ".cursor/rules/locksmith.md"))).toBe(true);

    expect(existsSync(join(projectDir, ".windsurf/rules/locksmith.md"))).toBe(false);
    expect(existsSync(join(projectDir, ".clinerules/locksmith.md"))).toBe(false);
    expect(existsSync(join(projectDir, ".github/copilot-instructions.md"))).toBe(false);
    expect(existsSync(join(projectDir, "AGENTS.md"))).toBe(false);

    expect(result.created).toContain(join(projectDir, ".trae/mcp.json"));
  });

  it("merges existing Trae mcpServers", async () => {
    const traeMcp = join(projectDir, ".trae/mcp.json");
    rmSync(join(projectDir, ".trae"), { recursive: true, force: true });
    mkdirSync(dirname(traeMcp), { recursive: true });
    writeFileSync(
      traeMcp,
      JSON.stringify({ mcpServers: { other: { command: "node", args: ["x"] } } }, null, 2)
    );

    await installProjectMcp({ projectPath: projectDir, locksmithRoot: ROOT });
    const trae = JSON.parse(readFileSync(traeMcp, "utf-8")) as any;
    expect(trae.mcpServers.other.command).toBe("node");
    expect(trae.mcpServers.locksmith.command).toBe("bun");
  });

  it("backs up invalid Trae JSON and regenerates it", async () => {
    const traeMcp = join(projectDir, ".trae/mcp.json");
    rmSync(join(projectDir, ".trae"), { recursive: true, force: true });
    mkdirSync(dirname(traeMcp), { recursive: true });
    writeFileSync(traeMcp, "{");

    await installProjectMcp({ projectPath: projectDir, locksmithRoot: ROOT });
    expect(existsSync(traeMcp + ".bak")).toBe(true);

    const trae = JSON.parse(readFileSync(traeMcp, "utf-8")) as any;
    expect(trae.mcpServers.locksmith.command).toBe("bun");
  });
});
