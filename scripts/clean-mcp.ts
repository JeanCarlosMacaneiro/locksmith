#!/usr/bin/env bun
/**
 * Removes locksmith MCP entries from all AI client config files.
 * Safe: preserves all other MCP servers and config keys.
 * Usage: bun run scripts/clean-mcp.ts [--dry-run]
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { $ } from "bun";
import { CLIENTS, getConfigPath } from "../bin/register-mcp";

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) {
  process.stdout.write("\x1b[33m[dry-run] No files will be modified\x1b[0m\n\n");
}

let cleaned = 0;
let skipped = 0;
let notFound = 0;

for (const client of CLIENTS) {
  // Codex uses CLI, not a JSON file
  if (client.configFormat === "codex-cli") {
    const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
    const legacyPath = `${HOME}/.codex/config.json`;

    // Clean legacy JSON file (written by older locksmith versions)
    if (existsSync(legacyPath)) {
      try {
        const raw = readFileSync(legacyPath, "utf-8");
        const config = JSON.parse(raw) as Record<string, unknown>;
        const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
        if (mcpServers && "locksmith" in mcpServers) {
          delete mcpServers.locksmith;
          if (!DRY_RUN) writeFileSync(legacyPath, JSON.stringify(config, null, 2));
          process.stdout.write(
            `  \x1b[32m✓\x1b[0m ${client.name}: legacy ~/.codex/config.json cleaned${DRY_RUN ? " \x1b[33m[dry-run]\x1b[0m" : ""}\n`
          );
          cleaned++;
        }
      } catch {
        // ignore parse errors on legacy file
      }
    }

    // Remove via codex CLI
    const codexPath = Bun.which("codex");
    if (!codexPath) {
      process.stdout.write(`  \x1b[2m– ${client.name}: codex CLI not found — skip CLI removal\x1b[0m\n`);
      if (!existsSync(legacyPath)) notFound++;
      continue;
    }
    if (DRY_RUN) {
      process.stdout.write(`  \x1b[32m✓\x1b[0m ${client.name}: would run codex mcp remove locksmith \x1b[33m[dry-run]\x1b[0m\n`);
      cleaned++;
    } else {
      try {
        await $`codex mcp remove locksmith`.quiet();
        process.stdout.write(`  \x1b[32m✓\x1b[0m ${client.name}: locksmith removed via CLI\n`);
        cleaned++;
      } catch {
        process.stdout.write(`  \x1b[2m– ${client.name}: not registered or remove not supported\x1b[0m\n`);
        skipped++;
      }
    }
    continue;
  }

  // ChatGPT and other UI-only clients
  const configPath = getConfigPath(client.id, process.platform);
  if (!configPath) {
    if (client.hint) {
      process.stdout.write(`  \x1b[2m→ ${client.name}: managed via UI — ${client.hint}\x1b[0m\n`);
    }
    continue;
  }

  if (!existsSync(configPath)) {
    process.stdout.write(`  \x1b[2m– ${client.name}: not found (${configPath})\x1b[0m\n`);
    notFound++;
    continue;
  }

  let raw: string;
  let config: Record<string, unknown>;
  try {
    raw = readFileSync(configPath, "utf-8");
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${client.name}: invalid JSON — skipping\n`);
    skipped++;
    continue;
  }

  let modified = false;

  if (client.configFormat === "zed") {
    const contextServers = config.context_servers as Record<string, unknown> | undefined;
    if (contextServers && "locksmith" in contextServers) {
      delete contextServers.locksmith;
      modified = true;
    }
  } else if (client.configFormat === "continue") {
    const servers = config.mcpServers as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(servers)) {
      const before = servers.length;
      config.mcpServers = servers.filter((s) => s.name !== "locksmith");
      if ((config.mcpServers as unknown[]).length !== before) modified = true;
    }
  } else if (client.configFormat === "opencode") {
    const mcp = config.mcp as Record<string, unknown> | undefined;
    if (mcp && "locksmith" in mcp) {
      delete mcp.locksmith;
      modified = true;
    }
  } else {
    // Standard: mcpServers object (Claude Desktop, Claude Code, Cursor, Windsurf, Cline, Kiro)
    const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
    if (mcpServers && "locksmith" in mcpServers) {
      delete mcpServers.locksmith;
      modified = true;
    }
  }

  if (!modified) {
    process.stdout.write(`  \x1b[2m– ${client.name}: locksmith not present\x1b[0m\n`);
    skipped++;
    continue;
  }

  if (!DRY_RUN) {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  process.stdout.write(
    `  \x1b[32m✓\x1b[0m ${client.name}: locksmith removed${DRY_RUN ? " \x1b[33m[dry-run]\x1b[0m" : ""}\n`
  );
  process.stdout.write(`    \x1b[2m${configPath}\x1b[0m\n`);
  cleaned++;
}

process.stdout.write(`\n  ${cleaned} cleaned · ${skipped} already clean · ${notFound} not installed\n`);
if (cleaned > 0 && !DRY_RUN) {
  process.stdout.write(
    "\n  \x1b[2mNow run: bun run ./bin/register-mcp.ts\x1b[0m\n"
  );
}
