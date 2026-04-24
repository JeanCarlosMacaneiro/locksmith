import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../..");

describe("Bug Condition — installer-mcp-multiselect", () => {
  it("isBugCondition_PS1: install.ps1 no debe hardcodear claude_desktop_config.json sin multiselect", () => {
    const ps1 = readFileSync(join(ROOT, "install.ps1"), "utf-8");
    expect(ps1).not.toContain("claude_desktop_config.json");
    expect(ps1).toContain("register-mcp.ts");
  });

  it("isBugCondition_SH: install.sh no debe contener lógica multiselect bash propia", () => {
    const sh = readFileSync(join(ROOT, "install.sh"), "utf-8");
    expect(sh).not.toContain("_MS_OPTIONS");
    expect(sh).not.toMatch(/^multiselect\s*\(/m);
    expect(sh).toContain("register-mcp.ts");
  });

  it("isBugCondition_Duplication: _inject_mcp_entry no debe existir en install.sh", () => {
    const sh = readFileSync(join(ROOT, "install.sh"), "utf-8");
    expect(sh).not.toContain("_inject_mcp_entry");
    expect(existsSync(join(ROOT, "bin/register-mcp.ts"))).toBe(true);
  });

  it("CI headless: bin/register-mcp.ts debe existir y terminar con exit 0 con CI=true", async () => {
    const registerMcpPath = join(ROOT, "bin/register-mcp.ts");
    expect(existsSync(registerMcpPath)).toBe(true);

    const proc = Bun.spawn(["bun", registerMcpPath], {
      env: { ...process.env, CI: "true" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  }, 15000);
});
