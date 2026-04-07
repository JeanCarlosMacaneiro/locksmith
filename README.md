# locksmith

A CLI tool that audits and enforces security policies across all Node.js / Bun projects in your company. Designed to protect against **supply chain attacks**, infected packages, and insecure dependency configurations.

---

## Requirements

- [Bun](https://bun.sh) `>= 1.0`
- [pnpm](https://pnpm.io) `>= 8.0`

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

The installer automatically:
- Checks and installs Bun if missing
- Checks and installs pnpm if missing
- Installs project dependencies
- Registers the `locksmith` command globally
- Updates your shell PATH if needed

After installation, the `locksmith` command will be available system-wide.

### Run directly without installing

```bash
bun run ./bin/cli.ts [path] [options]
```

---

## Usage

```bash
locksmith [path] [options]
```

| Argument | Description | Default |
|---|---|---|
| `[path]` | Path to the project to analyze | Current directory |
| `--fix` | Automatically apply available corrections | `false` |
| `--report json\|markdown` | Export the results to a file | — |
| `--strict` | Exit with code `1` on warnings (not only errors) | `false` |
| `-v, --version` | Show version | — |
| `-h, --help` | Show help | — |

### Examples

```bash
# Analyze the current directory
locksmith

# Analyze a specific project
locksmith /path/to/my-project

# Analyze and auto-fix all fixable issues
locksmith /path/to/my-project --fix

# Export results as JSON
locksmith /path/to/my-project --report json

# Export results as Markdown
locksmith /path/to/my-project --report markdown

# Fail on warnings (useful in CI pipelines)
locksmith /path/to/my-project --strict
```

---

## Security Checks

The tool runs **8 checks** in parallel on every project:

| Check | Description | Auto-fix |
|---|---|---|
| `pnpm version` | Validates pnpm is installed and `>= 8` | No |
| `.npmrc` | Enforces 5 required security rules | Yes |
| `pnpm-lock.yaml` | Ensures the lockfile exists and is not corrupted | No |
| `renovate.json` | Validates minimum release age for dependency updates | Yes |
| `onlyBuiltDependencies` | Verifies a build script allowlist is configured | Yes |
| `only-allow pnpm` | Ensures only pnpm can install dependencies | Yes |
| `packageManager` | Validates the exact pnpm version is pinned in `package.json` | Yes |
| `pnpm audit` | Runs `pnpm audit` to detect known CVEs | No |

### Check details

#### `.npmrc` — Required rules

All 5 rules below must be present:

```ini
ignore-scripts=true         # Prevents postinstall/preinstall script execution
verify-store-integrity=true # Validates package content hashes in the store
strict-ssl=true             # Enforces TLS certificate verification
frozen-lockfile=true        # Prevents pnpm install from overwriting the lockfile
node-linker=isolated        # Uses isolated node_modules (reduces ghost dependencies)
```

> **Auto-fix:** copies the `.npmrc` template with all required rules.

---

#### `renovate.json` — Minimum release age

Enforces a waiting period before applying dependency updates, allowing time to detect newly poisoned versions:

| Update type | Minimum age | Auto-merge |
|---|---|---|
| `patch` | 3 days | No |
| `minor` | 7 days | No |
| `major` | 30 days | No |

> **Auto-fix:** creates a `renovate.json` file with the required configuration.

When this check has a warning or error, locksmith displays contextual guidance in the console explaining what Renovate is, how to install it, and what commands to run to update dependencies manually.

---

#### `onlyBuiltDependencies` — Build script allowlist

Validates that `package.json` has either `pnpm.onlyBuiltDependencies` (allowlist) or `pnpm.neverBuiltDependencies` (denylist) configured.

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

Ensures `scripts.preinstall` contains `only-allow pnpm`, preventing npm or yarn from being used accidentally.

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

Validates that `package.json` has the `packageManager` field with an exact pnpm version, preventing version downgrade attacks.

```json
{
  "packageManager": "pnpm@10.25.0"
}
```

> **Auto-fix:** detects the pnpm version currently installed and writes it automatically.

Once set, [Renovate](https://github.com/apps/renovate) will open PRs automatically when a new pnpm version is available, respecting the configured release delays.

---

#### `pnpm audit` — Known CVEs

Runs `pnpm audit --json` and classifies results by severity:

| Result | Condition |
|---|---|
| `OK` | No vulnerabilities found |
| `WARN` | Only moderate or low severity |
| `ERROR` | One or more critical or high severity vulnerabilities |

---

## Output example

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

### Contextual hints

For checks that need attention, locksmith displays detailed guidance below the table. Example for `renovate.json` not found:

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

For `renovate.json` passing, hints show the pnpm commands available to update dependencies manually:

```
  ℹ  renovate.json
     Para actualizar una dependencia manualmente sin esperar a Renovate:
       $ pnpm update <paquete>          → actualiza a la última versión permitida
       $ pnpm update <paquete> --latest → actualiza ignorando rangos de versión
       $ pnpm add <paquete>@<version>   → instala una versión específica
```

---

## Report export

### JSON (`--report json`)

Generates `security-report.json` in the analyzed project directory:

```json
{
  "timestamp": "2026-04-07T10:00:00.000Z",
  "summary": { "ok": 8, "warn": 0, "error": 0 },
  "checks": [
    {
      "name": "pnpm version",
      "status": "ok",
      "message": "pnpm 10.25.0 instalado",
      "fixable": false
    }
  ]
}
```

### Markdown (`--report markdown`)

Generates `security-report.md` in the analyzed project directory with a formatted table.

---

## CI/CD Integration

Add to your pipeline to block merges if security policies are not met:

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

With `--strict`, the command exits with code `1` on any warning or error, causing the pipeline to fail.

In CI environments (`$CI` is set), the installer automatically uses `--frozen-lockfile` to enforce lockfile integrity.

---

## Development

```bash
# Install dependencies
pnpm install

# Run the CLI in dev mode
bun run dev

# Run tests
bun test

# Type check
bun run lint

# Build
bun run build
```

### Project structure

```
locksmith/
├── bin/
│   └── cli.ts                       # CLI entry point (yargs)
├── src/
│   ├── checks/
│   │   ├── index.ts                 # Orchestrator — runs all checks in parallel
│   │   ├── detect-project.ts        # Detects project type (node/bun)
│   │   ├── check-pnpm.ts            # pnpm version check
│   │   ├── check-npmrc.ts           # .npmrc rules check
│   │   ├── check-lockfile.ts        # pnpm-lock.yaml check
│   │   ├── check-renovate.ts        # Renovate release delay check + hints
│   │   ├── check-audit.ts           # CVE audit check
│   │   ├── check-built-deps.ts      # Build script allowlist check
│   │   ├── check-only-allow.ts      # only-allow pnpm check
│   │   └── check-package-manager.ts # packageManager field check
│   ├── reporter/
│   │   ├── console.ts               # Terminal output + contextual hints
│   │   └── export.ts                # JSON / Markdown export
│   ├── fixer/
│   │   └── apply.ts                 # Auto-fix implementations
│   └── types.ts                     # TypeScript interfaces
├── templates/
│   ├── .npmrc                       # Security .npmrc template
│   └── renovate.json                # Renovate config template
├── tests/
│   └── checks.test.ts               # Bun test suite (37 tests)
├── install.sh                       # Installer for macOS / Linux
└── install.ps1                      # Installer for Windows (PowerShell)
```

---

## Protection coverage

| Attack vector | Protected by |
|---|---|
| Malicious postinstall scripts | `ignore-scripts=true` + `onlyBuiltDependencies` |
| Tampered packages in transit | `strict-ssl=true` |
| Tampered packages in local store | `verify-store-integrity=true` |
| Lockfile overwrite / floating versions | `frozen-lockfile=true` + lockfile presence check |
| Newly poisoned package versions | `minimumReleaseAge` in Renovate |
| Multiple package managers altering lockfile | `only-allow pnpm` |
| pnpm version downgrade attacks | `packageManager` field |
| Known CVEs in dependencies | `pnpm audit` |

> **Note:** `pnpm audit` only covers **known CVEs**. It does not detect typosquatting or unknown malicious packages published for the first time. For that layer of protection, consider complementary tools such as [Socket.dev](https://socket.dev).
