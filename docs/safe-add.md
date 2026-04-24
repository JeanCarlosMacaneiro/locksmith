# Safe install — `locksmith add` / `locksmith update`

Verifies the security of a package **before** installing or updating it via pnpm. Prevents supply chain attacks at dependency-addition time.

---

## How it works

```
locksmith add express
```

1. **Resolves version** — fetches `latest` from the npm Registry (or uses the version you specified)
2. **Layer 1 (always)** — downloads the package's `package.json` and inspects its lifecycle scripts (`preinstall`, `install`, `postinstall`) for dangerous patterns
3. **Layer 2 (opt-in)** — if `SOCKET_SECURITY_API_TOKEN` is set, runs `socket package shallow` to get a supply chain risk score and alert list
4. **Shows Security Report** before any decision
5. **Installs** with `pnpm add --ignore-scripts` (or `pnpm update --ignore-scripts`)

---

## Risk levels

| Level | Trigger | Behavior |
|---|---|---|
| `none` | No issues found | Installs automatically |
| `medium` | Dangerous lifecycle scripts (`curl`, `wget`, `bash`, `sh`, `eval`, `exec`, `node -e`, `python -c`) | Asks for confirmation (or proceeds with `--force`) |
| `critical` | Socket.dev detects `malware` alert | **Blocked unconditionally** — even with `--force` |

---

## Commands

```bash
locksmith add <package>[@version] [options]
locksmith update <package>[@version] [options]
```

| Option | Description |
|---|---|
| `--force` | Skip confirmation on medium risk (does not bypass critical) |
| `--dry-run` | Run all checks and show the report without installing |

---

## Examples

```bash
locksmith add express              # resolve latest, inspect, install
locksmith add lodash@4.17.21      # specific version
locksmith add express --dry-run   # security report only, no install
locksmith add express --force     # skip medium-risk confirmation
locksmith update react             # check new version before updating
```

---

## Layer 2 — Socket.dev (opt-in)

Set `SOCKET_SECURITY_API_TOKEN` to enable:

```bash
export SOCKET_SECURITY_API_TOKEN=your_token
locksmith add express
```

Requires `socket` CLI to be installed (`npm install -g @socketsecurity/cli`). If not found, locksmith continues with Layer 1 only and shows a warning.

---

## Security guarantees

- `--ignore-scripts` is always passed to pnpm — lifecycle scripts are never executed during install
- `critical` risk (malware) blocks installation regardless of flags
- Layer 1 always runs, even when Socket.dev is configured
- Registry errors (404, timeout, network) abort the flow with exit code 1

---

## Error handling

| Situation | Behavior |
|---|---|
| Package not found on registry | Error message + exit 1 |
| Registry timeout (>10s) | Timeout message + exit 1 |
| `socket` not in PATH | Warning + continues with Layer 1 |
| Socket output not valid JSON | Warning + continues with Layer 1 |
| pnpm fails | Error propagated + exit 1 |
| `package.json` missing in project | Error + exit 1 before any fetch |
| `pnpm-lock.yaml` missing | Warning only — continues |
