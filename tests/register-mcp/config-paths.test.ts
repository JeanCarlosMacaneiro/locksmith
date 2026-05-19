import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getConfigPath, isClientInstalled, detectInstalledClients, CLIENTS } from "../../bin/register-mcp";
import fc from "fast-check";

const ENV = {
  HOME: "/home/testuser",
  APPDATA: "C:\\Users\\testuser\\AppData\\Roaming",
  USERPROFILE: "C:\\Users\\testuser",
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "locksmith-cp-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

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

  it("codex darwin → ~/.codex/config.toml", () => {
    expect(getConfigPath("codex", "darwin", ENV)).toBe(
      "/home/testuser/.codex/config.toml"
    );
  });

  it("codex linux → ~/.codex/config.toml", () => {
    expect(getConfigPath("codex", "linux", ENV)).toBe(
      "/home/testuser/.codex/config.toml"
    );
  });

  it("chatgpt darwin → null (remote HTTPS only)", () => {
    expect(getConfigPath("chatgpt", "darwin", ENV)).toBeNull();
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

  describe("isClientInstalled", () => {
    it("returns false when config parent dir does not exist", () => {
      expect(isClientInstalled("cursor", "linux", { HOME: tmpDir })).toBe(false);
    });

    it("returns true when config parent dir exists", () => {
      mkdirSync(join(tmpDir, ".cursor"), { recursive: true });
      expect(isClientInstalled("cursor", "linux", { HOME: tmpDir })).toBe(true);
    });

    it("returns false for unknown client id", () => {
      expect(isClientInstalled("nonexistent", "linux", { HOME: tmpDir })).toBe(false);
    });

    it("returns false when client has no path for platform", () => {
      // chatgpt is hint-only (remote HTTPS only) — no config paths on any platform
      expect(isClientInstalled("chatgpt", "darwin", { HOME: tmpDir })).toBe(false);
      expect(isClientInstalled("chatgpt", "linux", { HOME: tmpDir })).toBe(false);
    });

    it("codex: returns true when ~/.codex dir exists", () => {
      mkdirSync(join(tmpDir, ".codex"), { recursive: true });
      expect(isClientInstalled("codex", "darwin", { HOME: tmpDir })).toBe(true);
      expect(isClientInstalled("codex", "linux", { HOME: tmpDir })).toBe(true);
    });
  });

  describe("detectInstalledClients", () => {
    it("returns empty detected when no client dirs exist", () => {
      const { detected, undetected } = detectInstalledClients("linux", { HOME: tmpDir });
      expect(detected.length).toBe(0);
      expect(undetected.length).toBe(CLIENTS.length);
    });

    it("detects cursor when ~/.cursor exists", () => {
      mkdirSync(join(tmpDir, ".cursor"), { recursive: true });
      const { detected } = detectInstalledClients("linux", { HOME: tmpDir });
      expect(detected.some((c) => c.id === "cursor")).toBe(true);
    });

    it("detects multiple clients", () => {
      mkdirSync(join(tmpDir, ".cursor"), { recursive: true });
      mkdirSync(join(tmpDir, ".codeium/windsurf"), { recursive: true });
      const { detected, undetected } = detectInstalledClients("linux", { HOME: tmpDir });
      expect(detected.some((c) => c.id === "cursor")).toBe(true);
      expect(detected.some((c) => c.id === "windsurf")).toBe(true);
      expect(undetected.some((c) => c.id === "cursor")).toBe(false);
      expect(undetected.some((c) => c.id === "windsurf")).toBe(false);
    });

    it("detected + undetected = all CLIENTS", () => {
      mkdirSync(join(tmpDir, ".cursor"), { recursive: true });
      const { detected, undetected } = detectInstalledClients("linux", { HOME: tmpDir });
      expect(detected.length + undetected.length).toBe(CLIENTS.length);
    });
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
