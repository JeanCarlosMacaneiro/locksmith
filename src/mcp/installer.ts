import { existsSync } from "fs";
import { join } from "path";

// Resolve the compiled MCP binary path (preferred) or fall back to bun + .ts
export function resolveMcpCommand(locksmithRoot: string): { command: string; args: string[] } {
  const compiled = join(locksmithRoot, "dist", process.platform === "win32" ? "mcp.exe" : "mcp");
  if (existsSync(compiled)) {
    return { command: compiled, args: [] };
  }
  // Fallback: run TypeScript source via bun
  return { command: resolveBunPath(), args: [join(locksmithRoot, "bin", "mcp.ts")] };
}

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
const LOCALAPPDATA = process.env.LOCALAPPDATA ?? "";
const APPDATA = process.env.APPDATA ?? "";

const BUN_CANDIDATES = [
  // macOS — Homebrew (arm64 + x64)
  "/opt/homebrew/bin/bun",
  "/usr/local/bin/bun",
  // macOS/Linux — default bun installer (~/.bun)
  `${HOME}/.bun/bin/bun`,
  // Linux — system-wide
  "/usr/bin/bun",
  // Windows — default bun installer
  `${LOCALAPPDATA}\\bun\\bin\\bun.exe`,
  `${APPDATA}\\bun\\bun.exe`,
];

export function resolveBunPath(): string {
  // process.execPath is the bun binary itself when register-mcp runs under bun
  const exec = process.execPath ?? "";
  if (exec && (exec.endsWith("/bun") || exec.endsWith("\\bun.exe")) && existsSync(exec)) {
    return exec;
  }
  for (const candidate of BUN_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return "bun"; // fallback: rely on PATH (CI environments with bun in PATH)
}

export function buildMcpConfig(
  existingConfig: Record<string, unknown> | null,
  locksmithRoot: string,
): Record<string, unknown> {
  const { command, args } = resolveMcpCommand(locksmithRoot);
  const base = existingConfig ?? { mcpServers: {} };
  const mcpServers = (base.mcpServers as Record<string, unknown>) ?? {};
  const entry: Record<string, unknown> = { command };
  if (args.length > 0) entry.args = args;
  return {
    ...base,
    mcpServers: {
      ...mcpServers,
      locksmith: entry,
    },
  };
}

// Zed uses context_servers instead of mcpServers
export function buildZedConfig(
  existingConfig: Record<string, unknown> | null,
  locksmithRoot: string,
): Record<string, unknown> {
  const { command, args } = resolveMcpCommand(locksmithRoot);
  const base = existingConfig ?? {};
  const contextServers = (base.context_servers as Record<string, unknown>) ?? {};
  return {
    ...base,
    context_servers: {
      ...contextServers,
      locksmith: {
        command: args.length > 0 ? { path: command, args } : { path: command },
      },
    },
  };
}

// OpenCode uses a top-level "mcp" key with type/command array format
export function buildOpenCodeConfig(
  existingConfig: Record<string, unknown> | null,
  locksmithRoot: string,
): Record<string, unknown> {
  const { command, args } = resolveMcpCommand(locksmithRoot);
  const base = existingConfig ?? {};
  const mcp = (base.mcp as Record<string, unknown>) ?? {};
  return {
    ...base,
    mcp: {
      ...mcp,
      locksmith: {
        type: "local",
        command: args.length > 0 ? [command, ...args] : [command],
        enabled: true,
      },
    },
  };
}

// Codex CLI uses TOML format at ~/.codex/config.toml
export function buildCodexTomlConfig(existingContent: string, command: string, args: string[]): string {
  const lines = existingContent.split("\n");
  const filtered: string[] = [];
  let inLocksmith = false;

  for (const line of lines) {
    if (line.trim() === "[mcp_servers.locksmith]") {
      inLocksmith = true;
      continue;
    }
    if (inLocksmith && line.trim().startsWith("[")) {
      inLocksmith = false;
    }
    if (!inLocksmith) filtered.push(line);
  }

  let base = filtered.join("\n").trimEnd();
  if (base) base += "\n\n";

  let entry = `[mcp_servers.locksmith]\ncommand = ${JSON.stringify(command)}\n`;
  if (args.length > 0) {
    entry += `args = [${args.map((a) => JSON.stringify(a)).join(", ")}]\n`;
  }

  return base + entry;
}

// Continue.dev uses mcpServers as an array
export function buildContinueConfig(
  existingConfig: Record<string, unknown> | null,
  locksmithRoot: string,
): Record<string, unknown> {
  const { command, args } = resolveMcpCommand(locksmithRoot);
  const base = existingConfig ?? {};
  const servers = (base.mcpServers as Array<Record<string, unknown>>) ?? [];
  const filtered = servers.filter((s) => s.name !== "locksmith");
  const entry: Record<string, unknown> = { name: "locksmith", command };
  if (args.length > 0) entry.args = args;
  return {
    ...base,
    mcpServers: [...filtered, entry],
  };
}
