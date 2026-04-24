# locksmith

CLI that audits and enforces security policies for **Node.js / Bun** and **Python** projects. Detects the language automatically and runs all checks in parallel — no configuration needed.

---

## Requirements

| Ecosystem | Requirement |
|---|---|
| Node.js / Bun | [Bun](https://bun.sh) `>= 1.0` · [pnpm](https://pnpm.io) `>= 8.0` |
| Python | [Poetry](https://python-poetry.org) `>= 1.8` · [Python](https://python.org) `>= 3.12` |

---

## Installation

**macOS / Linux**

```bash
git clone https://github.com/your-org/locksmith.git
cd locksmith
./install.sh
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/your-org/locksmith.git
cd locksmith
.\install.ps1
```

The installer walks through 5 steps: Bun · pnpm · dependencies · `locksmith` command · AI client configuration.

Step 5 shows an interactive multiselect — pick which AI clients to configure (MCP server + behavior rules):

```
  ↑↓ navegar · espacio marcar · enter confirmar

  › [✓] Claude Desktop + Claude Code
    [✓] Cursor
    [ ] Windsurf
    [ ] Cline
    [ ] Kiro (Amazon)
    [ ] Trae (ByteDance)
    [ ] GitHub Copilot
    [ ] Google Antigravity
```

**Run without installing**

```bash
bun run ./bin/cli.ts [path] [options]
```

---

## Commands

| Command | What it does | Docs |
|---|---|---|
| `locksmith [path]` | Run all security checks (Node.js or Python, auto-detected) | [Node.js checks](docs/checks-node.md) · [Python checks](docs/checks-python.md) |
| `locksmith --fix` | Apply all available auto-fixes, then prompt to update Dockerfile | [Node.js checks](docs/checks-node.md) · [Python checks](docs/checks-python.md) |
| `locksmith --fix-dockerfile` | Analyze and fix Dockerfile only — skips security checks | [Dockerfile](docs/dockerfile.md) |
| `locksmith --outdated` | Show outdated packages against Renovate policy delays | [Outdated packages](docs/outdated.md) |
| `locksmith --outdated --fix` | Auto-apply safe patch updates that meet the policy age | [Outdated packages](docs/outdated.md) |
| `locksmith --report json\|markdown` | Export results to a file | — |
| `locksmith --strict` | Exit `1` on warnings too (CI mode) | — |
| `locksmith add <pkg>[@version]` | Inspect package security before installing via pnpm | [Safe add/update](docs/safe-add.md) |
| `locksmith update <pkg>[@version]` | Inspect package security before updating via pnpm | [Safe add/update](docs/safe-add.md) |

### Options for `add` / `update`

| Option | Description |
|---|---|
| `--force` | Skip confirmation on medium risk (never bypasses critical/malware) |
| `--dry-run` | Run all security checks and show report without installing |

### Quick reference

```bash
locksmith                            # security checks + Dockerfile warnings
locksmith --fix                      # auto-fix all issues + prompt Dockerfile update
locksmith --fix-dockerfile           # fix Dockerfile only
locksmith --outdated                 # show outdated packages with policy status
locksmith --outdated --fix           # auto-apply safe patches
locksmith --strict                   # block on warnings (CI mode)
locksmith . --report json            # export results as JSON

locksmith add express                # inspect latest, then install
locksmith add lodash@4.17.21        # inspect specific version, then install
locksmith add express --dry-run      # security report only, no install
locksmith add express --force        # skip medium-risk confirmation
locksmith update react               # inspect new version before updating
```

---

## What gets checked

### Node.js / Bun (12 checks)
pnpm version · `.npmrc` security rules · lockfile present · Renovate policy · `onlyBuiltDependencies` · `only-allow pnpm` · `packageManager` field · Node version pinned · `pnpm audit` · `.gitignore` patterns · secrets scan · security scripts

→ Full details: [docs/checks-node.md](docs/checks-node.md)

### Python / Poetry (11 checks)
Poetry installed · `pyproject.toml` present · `poetry.lock` present · Python version pinned · virtual env in-project · no `requirements.txt` · `pip audit` · `.gitignore` patterns · secrets scan · source pinned · dependency groups

→ Full details: [docs/checks-python.md](docs/checks-python.md)

### Dockerfile (multi-stage aware)
Base image version pinned · pnpm/corepack version pinned · `--frozen-lockfile` / `--ignore-scripts` flags · `.npmrc` copied before install · `pip install` replaced with `poetry install` · `--no-cache-dir` flag · config files copied

→ Full details: [docs/dockerfile.md](docs/dockerfile.md)

### Outdated packages
Compares installed versions against npm/PyPI registry, respects `renovate.json` `minimumReleaseAge` delays, auto-fixes safe patches only.

→ Full details: [docs/outdated.md](docs/outdated.md)

### Safe add / update
Two-layer check before install: lifecycle script inspection (always) + Socket.dev supply chain score (opt-in via `SOCKET_SECURITY_API_TOKEN`). Critical risk (malware) blocks unconditionally.

→ Full details: [docs/safe-add.md](docs/safe-add.md)

---

## Sample output

```
🔐 locksmith

   Analizando: /path/to/my-project

✓ Proyecto: my-project [node]

─────────────────────────────────────────────────────────────────────────
  Check                  Estado   Detalle
─────────────────────────────────────────────────────────────────────────
  ✓ pnpm version           OK       pnpm 10.25.0 instalado
  ✓ .npmrc                 OK       5/5 reglas activas
  ✓ pnpm-lock.yaml         OK       Lockfile presente (5.0 KB)
  ✓ renovate.json          OK       Release delay: patch 3d · minor 7d · major 30d
  ✓ onlyBuiltDependencies  OK       onlyBuiltDependencies: []
  ✓ only-allow pnpm        OK       Forzado: solo pnpm puede instalar dependencias
  ✓ packageManager         OK       Versión fijada: pnpm@10.25.0
  ✓ node version           OK       Versión fijada en .nvmrc: 22.11.0
  ✓ pnpm audit             OK       Sin vulnerabilidades conocidas
  ✓ .gitignore             OK       Patrones de seguridad presentes
  ✓ secrets scan           OK       Sin secrets detectados en el código fuente
  ✓ scripts policy         OK       Scripts de seguridad presentes
─────────────────────────────────────────────────────────────────────────

  12 ok
```

---

## CI/CD

```bash
locksmith . --strict
```

Exits `1` on any warning or error — blocks the merge.

```yaml
# GitHub Actions
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

---

## AI Integration (MCP Server)

locksmith exposes all operations as MCP tools. Any MCP-compatible AI client can call them directly — no CLI needed.

### Supported clients

| Client | MCP auto-configured | Behavior rules |
|---|---|---|
| Claude Desktop + Claude Code | ✓ global | `~/.claude/CLAUDE.md` |
| Cursor | ✓ global (`~/.cursor/mcp.json`) | `.cursor/rules/locksmith.md` per project |
| Windsurf | ✓ global (`~/.codeium/windsurf/mcp_config.json`) | `.windsurf/rules/locksmith.md` per project |
| Cline | ✓ global (VSCode extension storage) | `.clinerules/locksmith.md` per project |
| Kiro (Amazon) | ✓ global (`~/.kiro/settings/mcp.json`) | `~/.kiro/steering/locksmith.md` global |
| Trae (ByteDance) | manual (`.trae/mcp.json`) | `.trae/rules/locksmith.md` per project |
| GitHub Copilot | no MCP support | `.github/copilot-instructions.md` per project |
| Google Antigravity | in progress | `AGENTS.md` per project |

For project-level rules files, copy `docs/ai-skill.md` to the path shown above.

### MCP tools

| Tool | What it does |
|---|---|
| `locksmith_audit` | Full security audit |
| `locksmith_fix` | Apply auto-fixes (requires user approval) |
| `locksmith_audit_dockerfile` | Analyze Dockerfile |
| `locksmith_fix_dockerfile` | Fix Dockerfile (requires user approval) |
| `locksmith_check_outdated` | Outdated packages vs Renovate policy |
| `locksmith_safe_add` | Inspect package before installing |

→ Full behavior rules and tool reference: [docs/ai-skill.md](docs/ai-skill.md)

---

## Development

→ [docs/development.md](docs/development.md)
