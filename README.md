# locksmith

CLI and MCP server to audit and enforce security policies for **Node.js/Bun (pnpm)** and **Python (Poetry)** projects. It auto-detects the project type, runs checks in parallel, and can apply safe auto-fixes.

## What it does
- Audits project security configuration and practices (Node/Bun or Python)
- Applies auto-fixes when available (`--fix`)
- Analyzes and fixes Dockerfiles (multi-stage aware) (`--fix-dockerfile`, alias `--fix-docker`)
- Checks outdated packages against Renovate policy (`--outdated`)
- Installs MCP integration per project for IDE clients (`--install-mcp`)
- “Safe add/update”: inspects packages before installing/updating via pnpm (`add`, `update`)
- Exposes operations as MCP tools for AI clients

## Requirements

| Ecosystem | Requirement |
|---|---|
| Node.js / Bun | [Bun](https://bun.sh) `>= 1.0` · [pnpm](https://pnpm.io) `>= 8.0` |
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

Global MCP setup is configured for **Claude Desktop + Claude Code**.

For IDE-based clients (Trae, Cursor, Windsurf, Cline, Copilot, etc.), use the per-project command `locksmith --install-mcp`.

**Run without installing**
```bash
bun run ./bin/cli.ts [path] [options]
```

## Quick start

```bash
locksmith                          # audit + Dockerfile warnings
locksmith --fix                    # auto-fix + re-check + Dockerfile prompt
locksmith --fix-dockerfile         # auto-fix Dockerfile only (skips checks)
locksmith --outdated               # outdated packages vs Renovate policy
locksmith --outdated --fix         # auto-apply safe patches allowed by policy
locksmith --install-mcp            # configure MCP + rules for IDE clients (per project)
locksmith . --report json          # exports security-report.json in the project
locksmith . --report markdown      # exports security-report.md in the project
locksmith . --strict               # exit 1 on warnings too (CI mode)
```

## Command reference

| Command | What it does | Docs |
|---|---|---|
| `locksmith [path]` | Runs the security audit (auto-detects Node/Bun/Python) | [Node.js checks](docs/checks-node.md) · [Python checks](docs/checks-python.md) |
| `locksmith --fix` | Applies available auto-fixes and re-runs checks | [Node.js checks](docs/checks-node.md) · [Python checks](docs/checks-python.md) |
| `locksmith --fix-dockerfile` | Auto-fixes Dockerfile only (skips checks) | [Dockerfile](docs/dockerfile.md) |
| `locksmith --fix-docker` | Alias for `--fix-dockerfile` | [Dockerfile](docs/dockerfile.md) |
| `locksmith --outdated` | Outdated packages vs Renovate policy delays | [Outdated packages](docs/outdated.md) |
| `locksmith --outdated --fix` | Auto-apply safe patch updates allowed by policy | [Outdated packages](docs/outdated.md) |
| `locksmith --install-mcp` | Installs per-project MCP + rules for IDE clients | — |
| `locksmith --report json\|markdown` | Export results into a file in the project | — |
| `locksmith --strict` | Exit `1` on warnings too (CI mode) | — |
| `locksmith add <pkg>[@version]` | Inspect package security before installing via pnpm | [Safe add/update](docs/safe-add.md) |
| `locksmith update <pkg>[@version]` | Inspect package security before updating via pnpm | [Safe add/update](docs/safe-add.md) |

### Options for `add` / `update`

| Option | Description |
|---|---|
| `--force` | Skip confirmation on medium risk (never bypasses critical/malware) |
| `--dry-run` | Run the analysis and show the report without installing/updating |

## Outputs and exit codes
- Exported reports:
  - `--report json` → `security-report.json`
  - `--report markdown` → `security-report.md`
- Exit codes:
  - `0`: no errors (and no warnings if `--strict`)
  - `1`: any `error`, or any `warn` with `--strict`

## What gets checked

### Node.js / Bun
pnpm version · `.npmrc` security rules · lockfile present · Renovate policy · `onlyBuiltDependencies` · `only-allow pnpm` · `packageManager` field · Node version pinned · `pnpm audit` · `.gitignore` patterns · secrets scan · security scripts

→ Full details: [docs/checks-node.md](docs/checks-node.md)

### Python / Poetry
Poetry installed · `pyproject.toml` present · `poetry.lock` present · Python version pinned · `poetry audit` · `.gitignore` patterns · secrets scan · source pinned · dependency groups · Renovate policy

→ Full details: [docs/checks-python.md](docs/checks-python.md)

### Dockerfile (multi-stage aware)
Pinned versions · recommended flags · secure copy/order conventions · caching/security best practices

→ Full details: [docs/dockerfile.md](docs/dockerfile.md)

### Outdated packages
Compares installed versions against npm/PyPI registry, respects `renovate.json` `minimumReleaseAge` delays, auto-fixes safe patches only.

→ Full details: [docs/outdated.md](docs/outdated.md)

### Safe add / update
Two-layer check before install/update: lifecycle script inspection (always) + Socket.dev supply chain score (opt-in via `SOCKET_SECURITY_API_TOKEN`). Critical risk (malware) blocks unconditionally.

→ Full details: [docs/safe-add.md](docs/safe-add.md)

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

### Per-project IDE setup

Run `locksmith --install-mcp` in a project to create/update:

- `.trae/mcp.json` (adds `mcpServers.locksmith`)
- `.trae/rules/locksmith.md`
- `.cursor/rules/locksmith.md`
- `.windsurf/rules/locksmith.md`
- `.clinerules/locksmith.md`
- `.github/copilot-instructions.md`
- `AGENTS.md`

### MCP tools
| Tool | What it does |
|---|---|
| `locksmith_audit` | Full security audit |
| `locksmith_fix` | Apply auto-fixes |
| `locksmith_audit_dockerfile` | Analyze Dockerfile |
| `locksmith_fix_dockerfile` | Fix Dockerfile |
| `locksmith_check_outdated` | Outdated packages vs Renovate policy |
| `locksmith_safe_add` | Inspect package before installing |

→ Full behavior rules and tool reference: [docs/ai-skill.md](docs/ai-skill.md)

## Development
→ [docs/development.md](docs/development.md)
