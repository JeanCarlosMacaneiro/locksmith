# Dockerfile analysis — `--fix-dockerfile`

locksmith detects and fixes security issues in Dockerfiles for both Node.js and Python projects.

---

## Modes

| Command | Behavior |
|---|---|
| `locksmith` | Shows Dockerfile warnings inline, no file changes |
| `locksmith --fix` | After fixing security issues, prompts to update Dockerfile |
| `locksmith --fix-dockerfile` | Only analyzes Dockerfile, applies fixes directly (skips security checks) |

---

## Issue types

| Kind | Description | Action |
|---|---|---|
| `pin-version` | pnpm/corepack version not pinned | Replace line |
| `missing-flag` | `pnpm install` without `--frozen-lockfile` or `--ignore-scripts` | Replace line |
| `missing-copy` | `.npmrc` / `.python-version` / `poetry.toml` not copied before install | Insert before |
| `missing-cmd` | pnpm used before `corepack enable` | Insert before |
| `update-from` | `FROM node:<20` instead of `node:20` | Replace line |
| `advisory` | Informational warning only, no auto-fix | — |

---

## Node.js checks (multi-stage aware)

State resets per `FROM` instruction: `npmrcCopied`, `pnpmInstalled`, `inNodeStage`.

- `FROM node:<20` → suggests `node:20` (preserves `-alpine`/`-slim` suffix)
- `FROM nginx:alpine` → marks stage as non-node, skips all RUN checks
- `pnpm install` before `corepack enable` → inserts `RUN corepack enable`
- `npm install -g pnpm` without version → `pin-version`
- `corepack prepare pnpm` without version → `pin-version`
- `pnpm install` without `--frozen-lockfile`/`--ignore-scripts` → `missing-flag`
- `.npmrc` not copied before `pnpm install` → `missing-copy`
- `npm install/ci` in a pnpm project → replaced with pnpm equivalent
- `npm install -g <tool>` (global installs) → **excluded** from replacement

## Python checks

- `pip install X` in a Poetry project → replaced with `poetry install --no-interaction --no-root`
- `pip install` without `--no-cache-dir` → `missing-flag`
- `pip install -r requirements.txt` → `advisory`
- `poetry install` without `--no-interaction`/`--no-root` → `missing-flag`
- `.python-version` not copied → `missing-copy`
- `poetry.toml` not copied → `missing-copy`

---

## Sample output

```
🐳 Dockerfile: Dockerfile

  Problemas encontrados:
  ⚠  L12  pin-version   pnpm no pinned — versión puede diferir en producción
  ⚠  L18  missing-flag  pnpm install sin --frozen-lockfile, --ignore-scripts
  ⚠  L15  missing-copy  .npmrc no copiado antes de pnpm install

  → ejecuta locksmith --fix-dockerfile para corregir
```
