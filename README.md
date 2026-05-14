# locksmith

CLI and MCP server to audit and enforce security policies for **Node.js · Bun · Electron · Python** projects. Auto-detects the project type, runs checks in parallel, and can apply safe auto-fixes.

## What it does
- Audits security configuration and practices (Node/Bun/Electron or Python)
- Detects npm/yarn projects and proposes migration to pnpm
- Applies auto-fixes when available (`--fix`)
- Analyzes and fixes Dockerfiles — multi-stage aware (`--fix-dockerfile`)
- Checks outdated packages against Renovate policy (`--outdated`)
- "Safe add/update": inspects packages before installing/updating (`add`, `update`)
- Configures MCP integration for AI clients — global and per-project
- Exposes all operations as MCP tools for AI clients

## Requirements

| Ecosystem | Requirement |
|---|---|
| Node.js / Bun | [Bun](https://bun.sh) `>= 1.0` · [pnpm](https://pnpm.io) `>= 11.0` |
| Electron | Bun `>= 1.0` · pnpm `>= 11.0` |
| Python | [Python](https://python.org) `>= 3.12` · [Poetry](https://python-poetry.org) `>= 1.8` |

## Installation

**macOS / Linux**
```bash
git clone https://github.com/JeanCarlosMacaneiro/locksmith.git
cd locksmith
./install.sh
```

**Windows (PowerShell)**
```powershell
git clone https://github.com/JeanCarlosMacaneiro/locksmith.git
cd locksmith
.\install.ps1
```

The installer runs 5 steps: Bun · pnpm · dependencies · `locksmith` command · AI client (MCP) configuration.

**Run without installing**
```bash
bun run ./bin/cli.ts [path] [options]
```

## Quick start

```bash
locksmith                          # audit current project
locksmith --fix                    # auto-fix + re-check + Dockerfile prompt
locksmith --fix-dockerfile         # fix Dockerfile only
locksmith --outdated               # outdated packages vs Renovate policy
locksmith --outdated --fix         # auto-apply safe patch updates
locksmith add <pkg>                # inspect package before installing
locksmith register-mcp             # configure MCP for installed AI clients
locksmith --install-mcp            # per-project MCP + rules for IDE clients
locksmith . --report json          # export security-report.json
locksmith . --strict               # exit 1 on warnings (CI mode)
```

## Command reference

| Command | What it does | Docs |
|---|---|---|
| `locksmith [path]` | Security audit — auto-detects Node/Bun/Electron/Python | [Node checks](docs/checks-node.md) · [Python checks](docs/checks-python.md) |
| `locksmith --fix` | Apply auto-fixes and re-run checks | [Node checks](docs/checks-node.md) · [Python checks](docs/checks-python.md) |
| `locksmith --fix-dockerfile` | Auto-fix Dockerfile only | [Dockerfile](docs/dockerfile.md) |
| `locksmith --fix-docker` | Alias for `--fix-dockerfile` | [Dockerfile](docs/dockerfile.md) |
| `locksmith --outdated` | Outdated packages vs Renovate policy | [Outdated](docs/outdated.md) |
| `locksmith --outdated --fix` | Auto-apply safe patch updates | [Outdated](docs/outdated.md) |
| `locksmith add <pkg>[@ver]` | Inspect package security before installing | [Safe add/update](docs/safe-add.md) |
| `locksmith update <pkg>[@ver]` | Inspect package security before updating | [Safe add/update](docs/safe-add.md) |
| `locksmith register-mcp` | Configure MCP server for installed AI clients (global) | — |
| `locksmith --install-mcp` | Per-project MCP config + rules for IDE clients | — |
| `locksmith --install-mcp --install-mcp-clients <csv>` | Non-interactive client selection | — |
| `locksmith --report json\|markdown` | Export results to file in the project | — |
| `locksmith --strict` | Exit `1` on warnings too (CI mode) | — |

### Options for `add` / `update`

| Option | Description |
|---|---|
| `--force` | Skip confirmation on medium risk (never bypasses critical/malware) |
| `--dry-run` | Analyze without installing/updating |

## Outputs and exit codes

- `--report json` → `security-report.json`
- `--report markdown` → `security-report.md`
- Exit `0`: no errors (no warnings if `--strict`)
- Exit `1`: any error, or any warning with `--strict`

## What gets checked

### Node.js / Bun
pnpm version · `.npmrc` security rules · lockfile present · Renovate policy · `onlyBuiltDependencies` · `only-allow pnpm` · `packageManager` field · Node version pinned · `pnpm audit` · `.gitignore` patterns · secrets scan · security scripts

→ [docs/checks-node.md](docs/checks-node.md)

### Electron
All Node.js checks + Content Security Policy (CSP) · `nodeIntegration` disabled · native module rebuild integrity

→ [docs/checks-node.md](docs/checks-node.md)

### npm / yarn projects
Detected automatically. locksmith flags missing `pnpm-lock.yaml` and proposes migration: `corepack` + `pnpm import` + `pnpm install` + updates `packageManager` field + removes old lockfile.

### Python / Poetry
Poetry installed · `pyproject.toml` present · `poetry.lock` present · Python version pinned · `poetry audit` · `.gitignore` patterns · secrets scan · source pinned · dependency groups · Renovate policy

→ [docs/checks-python.md](docs/checks-python.md)

### Dockerfile (multi-stage aware)
Pinned base image versions · recommended flags · secure COPY/CMD conventions · layer caching and security best practices

→ [docs/dockerfile.md](docs/dockerfile.md)

### Outdated packages
Compares installed versions against npm/PyPI registry. Respects `renovate.json` `minimumReleaseAge` delays. Auto-fixes safe patches only.

→ [docs/outdated.md](docs/outdated.md)

### Safe add / update
Two-layer check before install/update: lifecycle script inspection (always) + Socket.dev supply chain score (opt-in via `SOCKET_SECURITY_API_TOKEN`). Critical risk (malware) blocks unconditionally.

→ [docs/safe-add.md](docs/safe-add.md)

## CI/CD

```bash
locksmith . --strict
```

Example (GitHub Actions):
```yaml
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - name: Install locksmith
        run: ./install.sh
      - name: Run security checks
        run: locksmith . --strict
```

## AI Integration (MCP Server)

locksmith exposes all operations as MCP tools. Any MCP-compatible AI client can call them directly — no CLI needed.

### Global MCP registration

Done automatically by the installer. To reconfigure or add more clients:

```bash
locksmith register-mcp
```

Auto-detects installed AI clients by checking their config directories. Configures all detected ones automatically. Falls back to interactive multi-select if none are detected.

| Client | Config written | Notes |
|---|---|---|
| Claude Desktop + Claude Code | `~/Library/Application Support/Claude/claude_desktop_config.json` | + rules appended to `~/.claude/CLAUDE.md` |
| Cursor | `~/.cursor/mcp.json` | — |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | — |
| Cline | VS Code extension settings | — |
| Kiro (Amazon) | `~/.kiro/settings/mcp.json` | + skill copied to `~/.kiro/steering/locksmith.md` |
| Zed | `~/.config/zed/settings.json` | `context_servers` format |
| Continue.dev | `~/.continue/config.json` | array `mcpServers` format |
| OpenAI Codex CLI | `~/.codex/config.json` | — |
| ChatGPT Desktop | — | UI only: Settings → Connectors → Add connector |

### Per-project IDE setup

Run once per project. Creates MCP config and copies skill rules for each client:

```bash
locksmith --install-mcp
```

| File created | Client | Type |
|---|---|---|
| `.mcp.json` | Claude Code | MCP server config |
| `CLAUDE.md` | Claude Code | Rules (appended) |
| `.trae/mcp.json` | Trae | MCP server config |
| `.trae/rules/locksmith.md` | Trae | Rules |
| `.cursor/rules/locksmith.md` | Cursor | Rules |
| `.windsurf/rules/locksmith.md` | Windsurf | Rules |
| `.clinerules/locksmith.md` | Cline | Rules |
| `.github/copilot-instructions.md` | GitHub Copilot | Rules |
| `AGENTS.md` | Google Jules / OpenAI Codex | Rules |

Non-interactive (CI/scripts):
```bash
locksmith --install-mcp --install-mcp-clients trae,claude,cursor,windsurf,cline,copilot,agents
```

> `trae` and `claude` create a per-project MCP server config. `copilot` and `agents` are rules-only.

### MCP tools

| Tool | What it does |
|---|---|
| `locksmith_audit` | Full security audit |
| `locksmith_fix` | Apply auto-fixes (requires approval) |
| `locksmith_audit_docker` | Analyze Dockerfiles with severity quality gate |
| `locksmith_audit_docker_security` | Docker audit + external scanners (Hadolint, Trivy, Scout) |
| `locksmith_audit_dockerfile` | Basic Dockerfile analysis |
| `locksmith_fix_docker` | Fix Dockerfile + build verification + LLM recovery loop |
| `locksmith_fix_dockerfile` | Fix Dockerfile (no build verification) |
| `locksmith_check_outdated` | Outdated packages vs Renovate policy |
| `locksmith_safe_add` | Inspect package security before installing |

→ Behavior rules: [docs/ai-skill.md](docs/ai-skill.md) · Full reference: [docs/ai-skill-reference.md](docs/ai-skill-reference.md)

## Development
→ [docs/development.md](docs/development.md)
