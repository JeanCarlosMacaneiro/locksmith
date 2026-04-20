# locksmith

A CLI tool that audits and enforces security policies across **Node.js / Bun** and **Python** projects. Protects against supply chain attacks, infected packages, and insecure dependency configurations.

Automatically detects the project language and runs all checks in parallel — no configuration needed.

**→ Checks:** [Node.js / Bun](docs/checks-node.md) · [Python / Poetry](docs/checks-python.md) · [Outdated packages](docs/outdated.md) · [Development](docs/development.md)

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

**Run without installing**

```bash
bun run ./bin/cli.ts [path] [options]
```

---

## Usage

```bash
locksmith [path] [options]
```

| Option | Description |
|---|---|
| `[path]` | Path to the project to analyze (default: current directory) |
| `--fix` | Automatically apply available corrections |
| `--fix-dockerfile` | Analyze and fix Dockerfile for the project (Node.js and Python) |
| `--outdated` | Check for outdated packages against Renovate policy delays |
| `--report json\|markdown` | Export results to a file |
| `--strict` | Exit with code `1` on warnings (not only errors) |

```bash
locksmith                        # Run security checks + Dockerfile warnings
locksmith --fix                  # Auto-fix all fixable issues + prompt Dockerfile update
locksmith --fix-dockerfile       # Only analyze and fix Dockerfile (skips security checks)
locksmith --outdated             # Show outdated packages
locksmith --outdated --fix       # Apply safe patch updates
locksmith --strict               # Block on warnings too
```

---

## Output

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
─────────────────────────────────────────────────────────────────────────

  11 ok
```

Results can be exported with `--report json` or `--report markdown`.

### Dockerfile analysis

When a `Dockerfile` is found, locksmith automatically analyzes it for security issues:

```
🐳 Dockerfile: Dockerfile

  Problemas encontrados:
  ⚠  L12  pin-version   pnpm no pinned — versión puede diferir en producción
  ⚠  L18  missing-flag  pnpm install sin --frozen-lockfile, --ignore-scripts
  ⚠  L15  missing-copy  .npmrc no copiado antes de pnpm install

  → ejecuta locksmith --fix-dockerfile para corregir
```

| Mode | Behavior |
|---|---|
| `locksmith` | Shows Dockerfile warnings inline, no changes |
| `locksmith --fix` | After fixing security issues, prompts to update Dockerfile |
| `locksmith --fix-dockerfile` | Only analyzes Dockerfile, prompts to apply fixes |

**Node.js checks:** pnpm version pinned, `--frozen-lockfile`, `--ignore-scripts`, `.npmrc` copied before install, `corepack prepare` version.

**Python checks:** `--no-interaction`, `--no-root` on `poetry install`, `.python-version` and `poetry.toml` copied before install, `--no-cache-dir` on `pip install`.

---

## CI/CD

```bash
locksmith . --strict
```

Exits with code `1` on any warning or error — blocks the merge.

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

## Documentation

- [docs/checks-node.md](docs/checks-node.md) — Node.js / Bun: 11 checks with details and examples
- [docs/checks-python.md](docs/checks-python.md) — Python / Poetry: 11 checks with details and examples
- [docs/outdated.md](docs/outdated.md) — `--outdated`: safety rules, Renovate policy, output reference
- [docs/development.md](docs/development.md) — Project structure, dev setup, how to add a check
- [docs/dockerfile.md](docs/dockerfile.md) — `--fix-dockerfile`: what is checked, Node.js and Python patterns
