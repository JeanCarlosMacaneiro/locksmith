# locksmith — Technical Reference

> For developers. Not deployed to the user's LLM.
> For the LLM skill see: `docs/ai-skill.md`

---

## MCP Tools — full schemas

### `locksmith_audit`
```json
{ "projectPath": "/absolute/path" }
```
Output: `AuditOutput` — projectType, projectName, summary {ok,warn,error}, checks[], hasErrors, hasWarnings, fixableCount.

### `locksmith_fix`
```json
{ "projectPath": "/absolute/path" }
```
Output: `FixOutput` — extends AuditOutput with `fixedChecks: string[]`.

### `locksmith_audit_docker`
```json
{ "projectPath": "/absolute/path", "failOn": "high" }
```
`failOn`: `"critical"|"high"|"medium"|"low"|"none"`. Default: `"high"`.
Output: found, dockerfilePath, issues[], issueCount, hasFixableIssues, qualityGatePassed, qualityGateSummary {critical,high,medium,low,info}.

### `locksmith_audit_docker_security`
```json
{ "projectPath": "/absolute/path", "failOn": "high", "skipHadolint": false, "skipTrivy": false, "skipDockerScout": false }
```
Output: extends audit_docker with `internalChecksRan`, `scanners[]` {name, status, issuesFound}, `llmFixInstructions?`.

### `locksmith_audit_dockerfile`
```json
{ "projectPath": "/absolute/path" }
```
Output: found, dockerfilePath, issues[], issueCount, hasFixableIssues. (No quality gate.)

### `locksmith_fix_docker`
```json
{ "projectPath": "/absolute/path", "verifyBuild": false, "buildFixProposal": null }
```
- `verifyBuild: true` → runs `docker build` post-fix. Requires Docker CLI.
- `buildFixProposal` → full proposed Dockerfile content for LLM recovery iterations.

Output: fixed, issuesFixed, dockerfilePath, buildVerified?, buildFixed?, buildFailure?, llmContext?, iterationCount?, remainingIterations?, nextStep?

**Recovery loop:** if `buildVerified: false` and `remainingIterations > 0` → use `llmContext` to generate `buildFixProposal` and call again. Max 5 iterations.

### `locksmith_fix_dockerfile`
```json
{ "projectPath": "/absolute/path" }
```
Output: fixed, issuesFixed, dockerfilePath. (No build verification.)

### `locksmith_check_outdated`
```json
{ "projectPath": "/absolute/path" }
```
Output: packages[] {name, current, latest, updateType, ageInDays, policyDays, policyMet, safeToUpdate}, totalOutdated, safeToUpdate, policyMet, warning?.

### `locksmith_safe_add`
```json
{ "projectPath": "/absolute/path", "package": "lodash@4.17.21", "install": false }
```
Output: name, resolvedVersion, riskLevel ("none"|"medium"|"critical"), dangerousScripts[], socketScore?, installed.

---

## Error codes

| Code | Description |
|---|---|
| `PROJECT_NOT_FOUND` | No package.json or pyproject.toml found |
| `PACKAGE_NOT_FOUND` | Package not found in npm registry |
| `INTERNAL_ERROR` | Unexpected tool error |

---

## npm/yarn → pnpm migration (detail)

Executed by `migrateToPnpm()` in `src/fixer/migrate-to-pnpm.ts`:

1. `corepack enable`
2. `corepack install -g pnpm@latest` (hash-verified, latest version)
3. `pnpm import` if package-lock.json or yarn.lock exists (migrates lockfile)
4. `pnpm install --ignore-scripts`
5. Updates `packageManager` field in package.json with exact installed version
6. Removes package-lock.json / yarn.lock / bun.lock

For Bun projects: skips step 3 (pnpm import does not support bun.lock).

---

## Electron checks

See full details in `docs/checks-electron.md`.

| Check | File | Detects |
|---|---|---|
| `electron-csp` | main process + HTML | Missing Content-Security-Policy |
| `electron-node-integration` | main process | `nodeIntegration: true` or `contextIsolation: false` |
| `electron-rebuild` | package.json | electron-rebuild in postinstall |

---

## IDE configuration

### Claude Desktop
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
`%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "locksmith": {
      "command": "bun",
      "args": ["/absolute/path/to/locksmith/bin/mcp.ts"]
    }
  }
}
```

### Cursor / Windsurf / Trae
`.cursor/mcp.json` or equivalent per client:
```json
{
  "mcpServers": {
    "locksmith": { "command": "bun", "args": ["/absolute/path/to/locksmith/bin/mcp.ts"] }
  }
}
```

Auto-configure via: `locksmith --install-mcp`
