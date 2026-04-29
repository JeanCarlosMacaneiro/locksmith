import { buildMcpConfig } from "../src/mcp/installer";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "fs";
import { dirname, join } from "path";

export interface McpClient {
  id: string;
  name: string;
  darwinPath?: string;
  linuxPath?: string;
  win32Path?: string;
  skillPath?: string;
  skillMode?: "append-to-file" | "copy-file";
  hint?: string;
}

export type PlatformEnv = Record<string, string | undefined>;

export const CLIENTS: McpClient[] = [
  {
    id: "claude-desktop",
    name: "Claude Desktop + Claude Code",
    darwinPath: "${HOME}/Library/Application Support/Claude/claude_desktop_config.json",
    linuxPath: "${HOME}/.config/Claude/claude_desktop_config.json",
    win32Path: "${APPDATA}\\Claude\\claude_desktop_config.json",
    skillPath: "${HOME}/.claude/CLAUDE.md",
    skillMode: "append-to-file",
  },
  {
    id: "cursor",
    name: "Cursor",
    darwinPath: "${HOME}/.cursor/mcp.json",
    linuxPath: "${HOME}/.cursor/mcp.json",
    win32Path: "${HOME}/.cursor/mcp.json",
    hint: "Cursor: copia docs/ai-skill.md → .cursor/rules/locksmith.md en cada proyecto",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    darwinPath: "${HOME}/.codeium/windsurf/mcp_config.json",
    linuxPath: "${HOME}/.codeium/windsurf/mcp_config.json",
    win32Path: "${HOME}/.codeium/windsurf/mcp_config.json",
    hint: "Windsurf: copia docs/ai-skill.md → .windsurf/rules/locksmith.md en cada proyecto",
  },
  {
    id: "cline",
    name: "Cline",
    darwinPath:
      "${HOME}/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json",
    linuxPath:
      "${HOME}/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json",
    win32Path:
      "${APPDATA}\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json",
    hint: "Cline: copia docs/ai-skill.md → .clinerules/locksmith.md en cada proyecto",
  },
  {
    id: "kiro",
    name: "Kiro (Amazon)",
    darwinPath: "${HOME}/.kiro/settings/mcp.json",
    linuxPath: "${HOME}/.kiro/settings/mcp.json",
    win32Path: "${HOME}/.kiro/settings/mcp.json",
    skillPath: "${HOME}/.kiro/steering/locksmith.md",
    skillMode: "copy-file",
  },
  {
    id: "trae",
    name: "Trae (ByteDance)",
    hint: "Trae: configuración es por proyecto — copia docs/ai-skill.md → .trae/rules/locksmith.md",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    hint: "GitHub Copilot: sin soporte MCP nativo — copia docs/ai-skill.md → .github/copilot-instructions.md",
  },
  {
    id: "antigravity",
    name: "Google Antigravity",
    hint: "Google Antigravity: configuración MCP en investigación — copia docs/ai-skill.md → AGENTS.md",
  },
];

function resolveTemplate(template: string, env: PlatformEnv): string {
  const home = env.HOME ?? env.USERPROFILE ?? "";
  const appdata = env.APPDATA ?? "";
  return template.replace(/\$\{HOME\}/g, home).replace(/\$\{APPDATA\}/g, appdata);
}

export function getConfigPath(
  clientId: string,
  platform: string,
  env: PlatformEnv = process.env
): string | null {
  const client = CLIENTS.find((c) => c.id === clientId);
  if (!client) return null;

  let template: string | undefined;
  if (platform === "darwin") template = client.darwinPath;
  else if (platform === "linux") template = client.linuxPath;
  else if (platform === "win32") template = client.win32Path;

  if (!template) return null;
  return resolveTemplate(template, env);
}

export function isInteractive(): boolean {
  return process.stdin.isTTY === true && !process.env.CI;
}

export async function askYesNo(question: string): Promise<boolean> {
  process.stdout.write(question + " ");
  return new Promise<boolean>((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");
    const handler = (data: string) => {
      const line = data.trim();
      process.stdin.removeListener("data", handler);
      process.stdin.pause();
      resolve(["s", "S", "y", "Y"].includes(line.charAt(0)));
    };
    process.stdin.once("data", handler);
  });
}

export async function multiselect(options: string[]): Promise<number[]> {
  const selected = new Array<boolean>(options.length).fill(false);
  selected[0] = true;
  let cursor = 0;

  const out = (s: string) => process.stdout.write(s);

  const draw = () => {
    for (let i = 0; i < options.length; i++) {
      const mark = selected[i] ? "\x1b[32m✓ \x1b[0m" : "  ";
      const prefix = i === cursor ? "  \x1b[36m›\x1b[0m " : "    ";
      out(`${prefix}${mark}${options[i]}\x1b[K\r\n`);
    }
  };

  const stdin = process.stdin as NodeJS.ReadStream;

  // set raw mode BEFORE drawing so terminal is ready
  stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("binary");

  out(`  \x1b[2m↑↓ navegar · espacio marcar · enter confirmar\x1b[0m\r\n\r\n`);
  draw();

  return new Promise<number[]>((resolve, reject) => {
    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.setEncoding("utf-8");
    };

    const onData = (chunk: string) => {
      const b0 = chunk.charCodeAt(0);
      const b1 = chunk.charCodeAt(1);
      const b2 = chunk.charCodeAt(2);

      // Ctrl+C
      if (b0 === 0x03) {
        cleanup();
        out("\r\n");
        reject(new Error("Interrupted"));
        return;
      }

      // arrow keys: ESC [ A/B
      if (b0 === 0x1b && b1 === 0x5b) {
        if (b2 === 0x41 && cursor > 0) cursor--;          // up
        if (b2 === 0x42 && cursor < options.length - 1) cursor++; // down
      } else if (b0 === 0x20) {
        // space — toggle
        selected[cursor] = !selected[cursor];
      } else if (b0 === 0x0d || b0 === 0x0a) {
        // enter — confirm
        const indices = selected.reduce<number[]>(
          (acc, s, i) => (s ? [...acc, i] : acc),
          []
        );
        cleanup();
        out("\r\n");
        resolve(indices);
        return;
      }

      // redraw: move cursor up N lines then redraw
      out(`\x1b[${options.length}A`);
      draw();
    };

    process.stdin.on("data", onData);
  });
}

export async function registerClient(
  client: McpClient,
  mcpEntryPath: string,
  scriptDir: string,
  platform: string = process.platform,
  env: PlatformEnv = process.env
): Promise<void> {
  const configPath = getConfigPath(client.id, platform, env);

  if (!configPath) {
    if (client.hint) process.stdout.write(`  \x1b[36m→\x1b[0m ${client.hint}\n`);
    return;
  }

  mkdirSync(dirname(configPath), { recursive: true });

  let existingConfig: Record<string, unknown> | null = null;
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    try {
      existingConfig = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      writeFileSync(configPath + ".bak", raw);
      existingConfig = null;
    }
  }

  const config = buildMcpConfig(existingConfig, mcpEntryPath);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  process.stdout.write(`  \x1b[32m✓\x1b[0m ${client.name}: MCP configurado\n`);

  if (client.skillPath && client.skillMode) {
    const skillDest = resolveTemplate(client.skillPath, env);
    const skillSrc = join(scriptDir, "docs/ai-skill.md");
    mkdirSync(dirname(skillDest), { recursive: true });

    if (client.skillMode === "copy-file") {
      if (!existsSync(skillDest)) {
        copyFileSync(skillSrc, skillDest);
        process.stdout.write(`  \x1b[32m✓\x1b[0m ${client.name}: skill instalado\n`);
      } else {
        process.stdout.write(`  \x1b[32m✓\x1b[0m ${client.name}: skill ya instalado\n`);
      }
    } else if (client.skillMode === "append-to-file") {
      const skillContent = readFileSync(skillSrc, "utf-8");
      const existingContent = existsSync(skillDest)
        ? readFileSync(skillDest, "utf-8")
        : "";
      if (!existingContent.includes("locksmith — AI rules")) {
        writeFileSync(
          skillDest,
          existingContent + "\n---\n# locksmith — AI rules\n" + skillContent
        );
        process.stdout.write(`  \x1b[32m✓\x1b[0m ${client.name}: reglas añadidas\n`);
      } else {
        process.stdout.write(`  \x1b[32m✓\x1b[0m ${client.name}: reglas ya instaladas\n`);
      }
    }
  }
}

export interface MainOverrides {
  interactive?: boolean;
  selectedIndices?: number[];
  scriptDir?: string;
  platform?: string;
  env?: PlatformEnv;
}

export async function main(overrides: MainOverrides = {}): Promise<void> {
  const scriptDir = overrides.scriptDir ?? join(import.meta.dir, "..");
  const mcpEntry = join(import.meta.dir, "mcp.ts");
  const platform = overrides.platform ?? process.platform;
  const env = overrides.env ?? process.env;

  const interactive = overrides.interactive ?? isInteractive();

  if (!interactive) {
    process.stdout.write(
      "  \x1b[36m→\x1b[0m Modo no interactivo — omitiendo integración AI\n"
    );
    return;
  }

  const answer =
    overrides.selectedIndices !== undefined
      ? true
      : await askYesNo("¿Instalar integración AI con clientes MCP? (s/n)");

  if (!answer) {
    process.stdout.write("  \x1b[2mIntegración AI omitida\x1b[0m\n");
    return;
  }

  const selectedIndices =
    overrides.selectedIndices !== undefined
      ? overrides.selectedIndices
      : await multiselect(CLIENTS.map((c) => c.name));

  if (selectedIndices.length === 0) {
    process.stdout.write(
      "  \x1b[33m⚠\x1b[0m  Ningún cliente seleccionado — omitiendo configuración\n"
    );
    return;
  }

  for (const idx of selectedIndices) {
    const client = CLIENTS[idx];
    if (client) {
      await registerClient(client, mcpEntry, scriptDir, platform, env);
    }
  }

  process.stdout.write("\n  \x1b[32m✓\x1b[0m Clientes AI configurados\n");
}

if (import.meta.main) {
  const clientsFlag = "--clients";
  const idx = process.argv.indexOf(clientsFlag);

  if (idx !== -1) {
    const raw = process.argv[idx + 1] ?? "";
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const scriptDir = join(import.meta.dir, "..");
    const mcpEntry = join(import.meta.dir, "mcp.ts");

    Promise.resolve()
      .then(async () => {
        for (const id of ids) {
          const client = CLIENTS.find((c) => c.id === id);
          if (!client) {
            process.stderr.write(`Cliente desconocido: ${id}\n`);
            process.exitCode = 1;
            continue;
          }
          await registerClient(client, mcpEntry, scriptDir);
        }
      })
      .catch((err: Error) => {
        process.stderr.write(`Error: ${err}\n`);
        process.exit(1);
      });
  } else {
    main().catch((err: Error) => {
    if (err.message !== "Interrupted") {
      process.stderr.write(`Error: ${err}\n`);
      process.exit(1);
    }
    });
  }
}
