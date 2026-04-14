# Node.js / Bun — Security Checks

locksmith runs **11 checks in parallel** when it detects a `package.json` in the project root.

| Check | What it validates | Auto-fix |
|---|---|---|
| `pnpm version` | pnpm is installed and `>= 8` | — |
| `.npmrc` | 5 required security rules are present | Yes |
| `pnpm-lock.yaml` | Lockfile exists and is not empty or corrupted | Yes |
| `renovate.json` | Minimum release age is configured for all update types | Yes |
| `onlyBuiltDependencies` | A build script allowlist or denylist is configured | Yes |
| `only-allow pnpm` | `scripts.preinstall` enforces pnpm as the only package manager | Yes |
| `packageManager` | Exact pnpm version is pinned in `package.json` | Yes |
| `node version` | Node.js version is pinned via `.nvmrc`, `.node-version` or `engines.node` | Yes |
| `pnpm audit` | No known CVEs in installed dependencies | — |
| `.gitignore` | Sensitive file patterns (`.env`, `*.pem`, `*.key`) are ignored | Yes |
| `secrets scan` | No hardcoded secrets or private keys in source files | — |

---

## `.npmrc` — Required security rules

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

## `onlyBuiltDependencies` — Build script allowlist

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

## `only-allow pnpm` — Package manager enforcement

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

## `packageManager` — Pinned pnpm version

`package.json` must have the `packageManager` field with an exact version, preventing silent pnpm version changes that could reintroduce vulnerabilities.

```json
{
  "packageManager": "pnpm@10.25.0"
}
```

> **Auto-fix:** detects the installed pnpm version and writes it automatically. Renovate keeps this field up to date when new pnpm versions are released.

---

## `node version` — Pinned Node.js version

One of the following must exist: `.nvmrc`, `.node-version`, or `engines.node` in `package.json`. Without this, developers and CI may silently run different Node.js versions.

```
# .nvmrc
22.11.0
```

```json
{ "engines": { "node": ">=22.0.0" } }
```

Minimum accepted version is Node 18 (oldest active LTS). Older versions trigger a warning.

> **Auto-fix:** detects the installed Node.js version and creates `.nvmrc`.

---

## `pnpm audit` — Known CVEs

Runs `pnpm audit --json` and classifies results:

| Status | Condition |
|---|---|
| `OK` | No vulnerabilities found |
| `WARN` | Only moderate or low severity |
| `ERROR` | One or more critical or high severity vulnerabilities |

> **Limitation:** `pnpm audit` only covers **known CVEs**. It does not detect typosquatting or brand-new malicious packages. For that layer, consider [Socket.dev](https://socket.dev).

---

## `renovate.json` — Minimum release age

Enforces a waiting period before allowing dependency updates, giving the community time to detect newly poisoned versions:

| Update type | Minimum age |
|---|---|
| `patch` | 3 days |
| `minor` | 7 days |
| `major` | 30 days |

Locksmith accepts `renovate.json` at the project root, `.github/renovate.json`, or `renovate.json5`.

> **Auto-fix:** creates `renovate.json` from the project template.

---

## `.gitignore` — Sensitive file patterns

`.gitignore` must exist and cover the following patterns:

| Pattern | Protects against |
|---|---|
| `.env` / `.env.*` | Environment variable files with API keys, DB credentials |
| `*.pem` | TLS certificates and private keys |
| `*.key` | Private key files |

> **Auto-fix:** creates `.gitignore` if missing, or appends the missing patterns to the existing file.

---

## `secrets scan` — Hardcoded secrets

Scans all source files for patterns that indicate hardcoded credentials:

| Pattern | Example |
|---|---|
| PEM private key | `-----BEGIN RSA PRIVATE KEY-----` |
| AWS access key | `AKIA` + 16 uppercase alphanumeric chars |
| GitHub token | `ghp_`, `gho_`, `ghs_` + 36+ chars |
| Stripe live key | `sk_live_` + 24+ chars |
| Generic assignment | `password = "hardcoded_value_123"` |

Returns `error` for high-confidence patterns (PEM, AWS, GitHub, Stripe) and `warn` for generic assignments. Not auto-fixable — secrets must be rotated and removed manually.

> **If a secret was already committed:** rotate it immediately and clean the git history using [git-filter-repo](https://github.com/newren/git-filter-repo).

---

## Protection coverage

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
| Hardcoded secrets in source code | `secrets scan` |
| Sensitive files committed to git | `.gitignore` check |
| Node.js version inconsistency | `.nvmrc` / `engines.node` pinning |
