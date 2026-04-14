# Python / Poetry — Security Checks

locksmith runs **11 checks in parallel** when it detects a `pyproject.toml` in the project root.

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
| `.gitignore` | Sensitive file patterns (`.env`, `*.pem`, `*.key`) are ignored | Yes |
| `secrets scan` | No hardcoded secrets or private keys in source files | — |

---

## `pyproject.toml` — Project configuration

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

## `poetry.toml` — Local virtualenv

The virtual environment must be created inside the project directory for isolation and reproducibility across machines and CI:

```toml
[virtualenvs]
in-project = true
prefer-active-python = true
```

> **Auto-fix:** creates `poetry.toml` from the project template.

---

## `poetry.lock` — Lockfile integrity

`poetry.lock` must exist and not be empty or corrupted. If the project previously used `pip` or `Pipenv`, the fix removes conflicting artifacts before regenerating the lockfile:

- `requirements.txt`
- `Pipfile` / `Pipfile.lock`
- `.venv/`

> **Auto-fix:** runs `poetry install` to generate a fresh `poetry.lock`.

---

## `dependency groups` — Production vs development

Dev dependencies (testing, linting, formatting) must be separated from production to avoid widening the attack surface in deployed environments:

```toml
[tool.poetry.dependencies]            # production
python = ">=3.12"
requests = "^2.31"

[tool.poetry.group.dev.dependencies]  # development only
pytest = "^7.0"
black = "^23.0"
ruff = "^0.1.0"
```

> **Auto-fix:** creates the `dev` group via `poetry add --group dev pytest`.

---

## `python version` — Pinned Python version

`.python-version` must exist with a `3.12.x` version to ensure all developers and CI environments use the exact same Python interpreter:

```
3.12.7
```

> **Auto-fix:** creates `.python-version` with `3.12.7`.

---

## `PyPI registry` — Official package source

`pyproject.toml` must not declare custom `[[tool.poetry.source]]` entries pointing to untrusted registries. A malicious registry could serve altered versions of legitimate packages.

> **Auto-fix:** removes any non-official source entries from `pyproject.toml`.

---

## `poetry audit` — Known CVEs

Runs `poetry audit` and classifies results by severity.

| Status | Condition |
|---|---|
| `OK` | No vulnerabilities found |
| `WARN` | Only moderate or low severity |
| `ERROR` | One or more critical or high severity vulnerabilities |

> **Limitation:** `poetry audit` only covers **known CVEs**. It does not detect typosquatting or brand-new malicious packages. For that layer, consider [Socket.dev](https://socket.dev).

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
| Packages from untrusted sources | PyPI registry validation |
| Floating / unpinned versions | `poetry.lock` presence + integrity check |
| Newly poisoned package versions | `minimumReleaseAge` in Renovate + `--outdated` |
| Dev dependencies leaking to production | dependency groups separation |
| Python version inconsistency | `.python-version` pinned to `3.12.x` |
| Known CVEs in dependencies | `poetry audit` |
| Insecure virtualenv setup | `poetry.toml` with `in-project = true` |
| Hardcoded secrets in source code | `secrets scan` |
| Sensitive files committed to git | `.gitignore` check |

> **Limitation:** Unlike Node.js, Python has no native equivalent to `ignore-scripts=true`. Poetry mitigates this by preferring pre-compiled wheels over running `setup.py`, but it is not a complete guarantee.
