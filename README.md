# locksmith

A CLI tool that audits and enforces security policies across **Node.js / Bun** and **Python** projects. Designed to protect against **supply chain attacks**, infected packages, and insecure dependency configurations.

Locksmith automatically detects the project language and runs the appropriate set of security checks — no configuration needed.

---

## Requirements

| Ecosystem | Requirement |
|---|---|
| Node.js / Bun | [Bun](https://bun.sh) `>= 1.0` · [pnpm](https://pnpm.io) `>= 8.0` |
| Python | [Poetry](https://python-poetry.org) `>= 1.8` · [Python](https://python.org) `>= 3.12` |

---

## Installation

### macOS / Linux

```bash
git clone https://github.com/your-org/locksmith.git
cd locksmith
./install.sh
```

### Windows (PowerShell)

```powershell
git clone https://github.com/your-org/locksmith.git
cd locksmith
.\install.ps1
```

> If PowerShell blocks the script, run first:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

The installer automatically checks and installs Bun and pnpm if missing, installs dependencies, registers the `locksmith` command globally, and updates your shell PATH.

### Run without installing

```bash
bun run ./bin/cli.ts [path] [options]
```

---

## Usage

```bash
locksmith [path] [options]
```

| Option | Description | Default |
|---|---|---|
| `[path]` | Path to the project to analyze | Current directory |
| `--fix` | Automatically apply available corrections | `false` |
| `--outdated` | Check for outdated packages validated against Renovate policy | `false` |
| `--report json\|markdown` | Export results to a file | — |
| `--strict` | Exit with code `1` on warnings (not only errors) | `false` |
| `-v, --version` | Show version | — |
| `-h, --help` | Show help | — |

### Common commands

```bash
# Run security checks on the current project
locksmith

# Auto-fix all fixable issues
locksmith --fix

# Check for outdated packages
locksmith --outdated

# Apply safe patch updates (patches that passed the Renovate delay policy)
locksmith --outdated --fix

# Block CI pipeline on any warning or error
locksmith --strict
```

---

## Security checks

Locksmith detects the project language from `package.json` (Node/Bun) or `pyproject.toml` (Python) and runs all checks in parallel.

### Node.js / Bun — 8 checks

| Check | What it validates | Auto-fix |
|---|---|---|
| `pnpm version` | pnpm is installed and `>= 8` | — |
| `.npmrc` | 5 required security rules are present | Yes |
| `pnpm-lock.yaml` | Lockfile exists and is not empty or corrupted | Yes |
| `renovate.json` | Minimum release age is configured for all update types | Yes |
| `onlyBuiltDependencies` | A build script allowlist or denylist is configured | Yes |
| `only-allow pnpm` | `scripts.preinstall` enforces pnpm as the only package manager | Yes |
| `packageManager` | Exact pnpm version is pinned in `package.json` | Yes |
| `pnpm audit` | No known CVEs in installed dependencies | — |

### Python / Poetry — 9 checks

| Check | What it validates | Auto-fix |
|---|---|---|
| `poetry version` | Poetry is installed and `>= 1.8` | — |
| `pyproject.toml` | File exists with `[tool.poetry]` and `python = ">=3.12"` | Yes |
| `poetry.toml` | `virtualenvs.in-project = true` is set | Yes |
| `poetry.lock` | Lockfile exists and is not empty or corrupted | Yes |
| `renovate.json` | Minimum release age is configured for all update types | Yes |
| `poetry audit` | No known CVEs in installed dependencies | — |
| `dependency groups` | Dev dependencies are separated from production | Yes |
| `python version` | `.python-version` is pinned to `3.12.x` | Yes |
| `PyPI registry` | No custom sources pointing to untrusted registries | Yes |

---

### Node.js / Bun — check details

#### `.npmrc` — Required security rules

All 5 rules must be present:

```ini
ignore-scripts=true         # Prevents postinstall/preinstall script execution
verify-store-integrity=true # Validates package content hashes in the store
strict-ssl=true             # Enforces TLS certificate verification
frozen-lockfile=true        # Prevents pnpm install from overwriting the lockfile
node-linker=isolated        # Uses isolated node_modules (reduces ghost dependencies)
```

> **Auto-fix:** copies the `.npmrc` template with all required rules.

---

#### `onlyBuiltDependencies` — Build script allowlist

`package.json` must have either `pnpm.onlyBuiltDependencies` (allowlist) or `pnpm.neverBuiltDependencies` (denylist). Without this, any package can run arbitrary code during installation via `postinstall`.

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["esbuild", "sharp"]
  }
}
```

> **Auto-fix:** adds `"pnpm": { "onlyBuiltDependencies": [] }` to `package.json`, blocking all packages from running build scripts.

---

#### `only-allow pnpm` — Package manager enforcement

`scripts.preinstall` must contain `only-allow pnpm` to prevent npm or yarn from being used accidentally, which would alter the lockfile.

```json
{
  "scripts": {
    "preinstall": "npx only-allow pnpm"
  }
}
```

> **Auto-fix:** adds the `preinstall` script to `package.json`.

---

#### `packageManager` — Pinned pnpm version

`package.json` must have the `packageManager` field with an exact version, preventing silent pnpm version changes that could reintroduce vulnerabilities.

```json
{
  "packageManager": "pnpm@10.25.0"
}
```

> **Auto-fix:** detects the installed pnpm version and writes it automatically. Renovate keeps this field up to date when new pnpm versions are released.

---

#### `pnpm audit` — Known CVEs

Runs `pnpm audit --json` and classifies results:

| Status | Condition |
|---|---|
| `OK` | No vulnerabilities found |
| `WARN` | Only moderate or low severity |
| `ERROR` | One or more critical or high severity vulnerabilities |

---

### Python / Poetry — check details

#### `pyproject.toml` — Project configuration

Must exist with `[tool.poetry]` and `python = ">=3.12"` in the dependencies section:

```toml
[tool.poetry]
name = "my-project"
version = "0.1.0"

[tool.poetry.dependencies]
python = ">=3.12"
```

> **Auto-fix:** runs `poetry init` if missing, or patches `requires-python` if the version is below 3.12.

---

#### `poetry.toml` — Local virtualenv

The virtual environment must be created inside the project directory for isolation and reproducibility across machines and CI:

```toml
[virtualenvs]
in-project = true
prefer-active-python = true
```

> **Auto-fix:** creates `poetry.toml` from the project template.

---

#### `poetry.lock` — Lockfile integrity

`poetry.lock` must exist and not be empty or corrupted. If the project previously used `pip` or `Pipenv`, the fix removes conflicting artifacts before regenerating the lockfile:

- `requirements.txt`
- `Pipfile` / `Pipfile.lock`
- `.venv/`

> **Auto-fix:** runs `poetry install` to generate a fresh `poetry.lock`.

---

#### `dependency groups` — Production vs development

Dev dependencies (testing, linting, formatting) must be separated from production to avoid widening the attack surface in deployed environments:

```toml
[tool.poetry.dependencies]          # production
python = ">=3.12"
requests = "^2.31"

[tool.poetry.group.dev.dependencies]  # development only
pytest = "^7.0"
black = "^23.0"
ruff = "^0.1.0"
```

> **Auto-fix:** creates the `dev` group via `poetry add --group dev pytest`.

---

#### `python version` — Pinned Python version

`.python-version` must exist with a `3.12.x` version to ensure all developers and CI environments use the exact same Python interpreter:

```
3.12.7
```

> **Auto-fix:** creates `.python-version` with `3.12.7`.

---

#### `PyPI registry` — Official package source

`pyproject.toml` must not declare custom `[[tool.poetry.source]]` entries pointing to untrusted registries. A malicious registry could serve altered versions of legitimate packages.

> **Auto-fix:** removes any non-official source entries from `pyproject.toml`.

---

#### `renovate.json` — Minimum release age (shared)

Both ecosystems enforce a waiting period before allowing dependency updates, giving the community time to detect newly poisoned versions:

| Update type | Minimum age | Auto-merge |
|---|---|---|
| `patch` | 3 days | No |
| `minor` | 7 days | No |
| `major` | 30 days | No |

> **Auto-fix:** creates `renovate.json` from the project template.

Locksmith accepts `renovate.json` at the project root, `.github/renovate.json`, or `renovate.json5`.

---

## Package updates (`--outdated`)

`locksmith --outdated` adds an update report after the security checks. For each outdated package it shows the available version, how many days ago it was published, and whether it meets the `minimumReleaseAge` policy from `renovate.json`.

```
📦 Paquetes desactualizados

  PATCH  — política: 3d · sin breaking changes
  ────────────────────────────────────────────────────────────────────────
  ✓ picocolors   1.1.1 → 1.2.0   publicado hace 5d   ✅ política ok (3d)   $ pnpm update picocolors
  ⏳ is-odd       3.0.0 → 3.0.1   publicado hace 1d   ⏳ muy reciente (faltan 2d)

  MINOR  — política: 7d · nueva funcionalidad — revisar changelog
  ────────────────────────────────────────────────────────────────────────
  ✓ yargs        17.7.2 → 18.0.0  publicado hace 12d  ✅ política ok (7d)   $ pnpm update yargs

  MAJOR  — política: 30d · breaking changes posibles — revisión obligatoria
  ────────────────────────────────────────────────────────────────────────
  ⏳ typescript   5.9.3 → 6.0.2   publicado hace 8d   ⏳ muy reciente (faltan 22d)

  2 patch(es) listos para --fix · 1 requieren revisión manual · 2 en período de espera

  Patches seguros disponibles → ejecuta con: locksmith . --outdated --fix

  En período de espera:
    is-odd      disponible en 2d
    typescript  disponible en 22d
```

### Update safety rules

| Update type | `--fix` applies? | Reason |
|---|---|---|
| `patch` | **Yes** — only if policy is met | Low risk, no breaking changes |
| `minor` | No — shows manual command | New functionality, possible edge cases |
| `major` | No — shows manual command | Breaking changes, always requires human review |
| Any type within waiting period | No — shows when it will be ready | Too recent to trust |

If no `renovate.json` is found, the default policy is applied (`patch: 3d · minor: 7d · major: 30d`) and a warning is shown.

---

## Output & reports

### Terminal output

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
  ✓ pnpm audit             OK       Sin vulnerabilidades conocidas
─────────────────────────────────────────────────────────────────────────

  8 ok
```

Checks that can be corrected show a `[--fix]` badge. After running `--fix`, corrected checks show `[fixed]` in green.

### Contextual hints

For checks that need attention, locksmith shows detailed guidance below the results table. Example for `renovate.json` not found:

```
  ℹ  renovate.json
     Renovate es un bot que abre PRs automáticamente cuando hay nuevas versiones de tus dependencias.
     Sin este archivo, las actualizaciones no tienen período de espera y pueden introducir paquetes maliciosos.

     Paso 1 — Crear el archivo de configuración:
       $ locksmith --fix

     Paso 2 — Instalar Renovate en tu repositorio (solo una vez por organización):
       → GitHub:    https://github.com/apps/renovate
       → GitLab:    https://docs.renovatebot.com/modules/platform/gitlab/
       → Bitbucket: https://docs.renovatebot.com/modules/platform/bitbucket/
```

### Export (`--report`)

#### JSON

```bash
locksmith --report json
```

Generates `security-report.json` in the analyzed directory:

```json
{
  "timestamp": "2026-04-07T10:00:00.000Z",
  "summary": { "ok": 8, "warn": 0, "error": 0 },
  "checks": [
    { "name": "pnpm version", "status": "ok", "message": "pnpm 10.25.0 instalado", "fixable": false }
  ]
}
```

#### Markdown

```bash
locksmith --report markdown
```

Generates `security-report.md` with a formatted table — useful for including in PRs or internal documentation.

---

## CI/CD integration

```bash
locksmith . --strict
```

`--strict` exits with code `1` on any warning or error, blocking the merge. The command is the same regardless of ecosystem — locksmith auto-detects the language.

```yaml
# GitHub Actions example
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - name: Install locksmith
        run: ./install.sh
      - name: Run security policy check
        run: locksmith . --strict
```

In CI environments (where `$CI` is set), the installer automatically uses `--frozen-lockfile` to enforce lockfile integrity.

---

## Protection coverage

### Node.js / Bun

| Attack vector | Protected by |
|---|---|
| Malicious postinstall scripts | `ignore-scripts=true` + `onlyBuiltDependencies` |
| Tampered packages in transit | `strict-ssl=true` |
| Tampered packages in local store | `verify-store-integrity=true` |
| Lockfile overwrite / floating versions | `frozen-lockfile=true` + lockfile check |
| Newly poisoned package versions | `minimumReleaseAge` in Renovate + `--outdated` |
| Multiple package managers altering lockfile | `only-allow pnpm` |
| pnpm version downgrade attacks | `packageManager` field |
| Known CVEs in dependencies | `pnpm audit` |

### Python / Poetry

| Attack vector | Protected by |
|---|---|
| Packages from untrusted sources | PyPI registry validation |
| Floating / unpinned versions | `poetry.lock` presence + integrity check |
| Newly poisoned package versions | `minimumReleaseAge` in Renovate + `--outdated` |
| Dev dependencies leaking to production | dependency groups separation |
| Python version inconsistency | `.python-version` pinned to `3.12.x` |
| Known CVEs in dependencies | `poetry audit` |
| Insecure virtualenv setup | `poetry.toml` with `in-project = true` |

> **Python limitation:** Unlike Node.js, Python has no native equivalent to `ignore-scripts=true`. Poetry mitigates this by preferring pre-compiled wheels over running `setup.py`, but it is not a complete guarantee.

> **Audit limitation:** `pnpm audit` and `poetry audit` only cover **known CVEs**. They do not detect typosquatting or brand-new malicious packages. For that layer, consider [Socket.dev](https://socket.dev).

---

## Development

```bash
pnpm install      # Install dependencies
bun run dev       # Run the CLI in dev mode
bun test          # Run tests (102 tests)
bun run lint      # Type check
bun run build     # Build
```

### Project structure

```
locksmith/
├── bin/
│   └── cli.ts                  # CLI entry point (yargs)
├── src/
│   ├── checks/
│   │   ├── index.ts             # Orchestrator — detects language, runs checks in parallel
│   │   ├── detect-project.ts    # Detects project type (node / bun / python)
│   │   ├── check-renovate.ts    # Renovate check — shared between Node and Python
│   │   ├── check-pnpm.ts        # pnpm version
│   │   ├── check-npmrc.ts       # .npmrc rules
│   │   ├── check-lockfile.ts    # pnpm-lock.yaml
│   │   ├── check-audit.ts       # pnpm CVE audit
│   │   ├── check-built-deps.ts  # onlyBuiltDependencies
│   │   ├── check-only-allow.ts  # only-allow pnpm
│   │   ├── check-package-manager.ts  # packageManager field
│   │   └── python/
│   │       ├── check-poetry.ts         # Poetry version
│   │       ├── check-pyproject.ts      # pyproject.toml + requires-python
│   │       ├── check-poetry-toml.ts    # virtualenvs.in-project
│   │       ├── check-poetry-lock.ts    # poetry.lock integrity
│   │       ├── check-poetry-audit.ts   # Poetry CVE audit
│   │       ├── check-dep-groups.ts     # dev/prod dependency separation
│   │       ├── check-python-version.ts # .python-version
│   │       └── check-pypi-source.ts    # PyPI registry
│   ├── outdated/
│   │   ├── index.ts             # Orchestrator — runs pnpm/poetry outdated
│   │   ├── classify.ts          # Pure functions: semver classification + Renovate policy
│   │   ├── fetch-dates.ts       # Publish date lookup via npm / PyPI registry API
│   │   └── reporter.ts          # Terminal output for outdated packages
│   ├── reporter/
│   │   ├── console.ts           # Terminal output + contextual hints
│   │   └── export.ts            # JSON / Markdown export
│   ├── fixer/
│   │   └── apply.ts             # All auto-fix implementations (Node + Python)
│   └── types.ts                 # TypeScript interfaces
├── templates/
│   ├── .npmrc                   # Security .npmrc template
│   ├── poetry.toml              # poetry.toml template
│   └── renovate.json            # Renovate config template
├── tests/
│   └── checks.test.ts           # 102 tests (Node + Python checks, fixers, outdated)
├── install.sh                   # Installer for macOS / Linux
└── install.ps1                  # Installer for Windows (PowerShell)
```

---

## References

| Tool | Documentation |
|---|---|
| pnpm | [pnpm.io/motivation](https://pnpm.io/motivation) |
| pnpm CLI | [pnpm.io/cli/install](https://pnpm.io/cli/install) |
| pnpm security | [pnpm.io/security](https://pnpm.io/security) |
| Poetry | [python-poetry.org/docs](https://python-poetry.org/docs/) |
| Poetry CLI | [python-poetry.org/docs/cli](https://python-poetry.org/docs/cli/) |
| Poetry configuration | [python-poetry.org/docs/configuration](https://python-poetry.org/docs/configuration/) |
| Renovate | [docs.renovatebot.com](https://docs.renovatebot.com) |
| Socket.dev | [socket.dev](https://socket.dev) |
