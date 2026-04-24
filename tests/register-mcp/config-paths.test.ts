import { describe, it, expect } from "bun:test";
import { getConfigPath, CLIENTS } from "../../bin/register-mcp";
import fc from "fast-check";

const ENV = {
  HOME: "/home/testuser",
  APPDATA: "C:\\Users\\testuser\\AppData\\Roaming",
  USERPROFILE: "C:\\Users\\testuser",
};

describe("getConfigPath — config paths por cliente y plataforma", () => {
  it("claude-desktop darwin → Library/Application Support/Claude", () => {
    expect(getConfigPath("claude-desktop", "darwin", ENV)).toBe(
      "/home/testuser/Library/Application Support/Claude/claude_desktop_config.json"
    );
  });

  it("claude-desktop linux → ~/.config/Claude", () => {
    expect(getConfigPath("claude-desktop", "linux", ENV)).toBe(
      "/home/testuser/.config/Claude/claude_desktop_config.json"
    );
  });

  it("claude-desktop win32 → %APPDATA%\\Claude", () => {
    expect(getConfigPath("claude-desktop", "win32", ENV)).toBe(
      "C:\\Users\\testuser\\AppData\\Roaming\\Claude\\claude_desktop_config.json"
    );
  });

  it("trae darwin → null (hint only)", () => {
    expect(getConfigPath("trae", "darwin", ENV)).toBeNull();
  });

  it("copilot linux → null (hint only)", () => {
    expect(getConfigPath("copilot", "linux", ENV)).toBeNull();
  });

  it("antigravity win32 → null (hint only)", () => {
    expect(getConfigPath("antigravity", "win32", ENV)).toBeNull();
  });

  it("cursor darwin → ~/.cursor/mcp.json", () => {
    expect(getConfigPath("cursor", "darwin", ENV)).toBe(
      "/home/testuser/.cursor/mcp.json"
    );
  });

  it("cursor win32 → mismo path que darwin (HOME-based, no APPDATA)", () => {
    expect(getConfigPath("cursor", "win32", ENV)).toBe(
      "/home/testuser/.cursor/mcp.json"
    );
  });

  it("windsurf linux → ~/.codeium/windsurf/mcp_config.json", () => {
    expect(getConfigPath("windsurf", "linux", ENV)).toBe(
      "/home/testuser/.codeium/windsurf/mcp_config.json"
    );
  });

  it("kiro darwin → ~/.kiro/settings/mcp.json", () => {
    expect(getConfigPath("kiro", "darwin", ENV)).toBe(
      "/home/testuser/.kiro/settings/mcp.json"
    );
  });

  it("cline darwin → Library/Application Support/Code path", () => {
    expect(getConfigPath("cline", "darwin", ENV)).toBe(
      "/home/testuser/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
    );
  });

  it("cline win32 → %APPDATA%\\Code path", () => {
    expect(getConfigPath("cline", "win32", ENV)).toBe(
      "C:\\Users\\testuser\\AppData\\Roaming\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json"
    );
  });

  it("cliente desconocido → null", () => {
    expect(getConfigPath("unknown-client-xyz", "darwin", ENV)).toBeNull();
  });

  describe("Property: clients con paths definidos retornan strings no vacíos", () => {
    const clientsWithPaths = CLIENTS.filter(
      (c) => c.darwinPath || c.linuxPath || c.win32Path
    );

    it("para clientes con paths, getConfigPath retorna string no vacío en plataformas soportadas", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...clientsWithPaths),
          fc.constantFrom("darwin", "linux", "win32"),
          (client, platform) => {
            const hasPlatformPath =
              (platform === "darwin" && client.darwinPath) ||
              (platform === "linux" && client.linuxPath) ||
              (platform === "win32" && client.win32Path);

            const result = getConfigPath(client.id, platform, ENV);

            if (hasPlatformPath) {
              expect(typeof result).toBe("string");
              expect(result!.length).toBeGreaterThan(0);
            } else {
              expect(result).toBeNull();
            }
          }
        )
      );
    });
  });
});
