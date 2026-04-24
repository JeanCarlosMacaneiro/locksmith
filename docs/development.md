# Development

## Requirements

| Tool | Version |
|---|---|
| [Bun](https://bun.sh) | `>= 1.0` |
| [pnpm](https://pnpm.io) | `>= 8.0` |

## Setup

```bash
pnpm install   # Install dependencies
bun test       # Run all tests (286 tests, 10 files)
bun run build  # Build dist/
```

---

## Project structure

```
locksmith/
├── bin/
│   └── cli.ts                       # CLI entry point (yargs) — all commands
├── src/
│   ├── types.ts                     # Core interfaces + safe-add types
│   ├── checks/
│   │   ├── index.ts                 # Orchestrator — detects language, runs checks, routes --fix modes
│   │   ├── detect-project.ts        # Detects project type (node / bun / python)
│   │   ├── check-renovate.ts        # Renovate check (shared Node + Python)
│   │   ├── check-secrets.ts         # Secrets scan (shared)
│   │   ├── check-gitignore.ts       # .gitignore validation (shared)
│   │   ├── check-pnpm.ts
│   │   ├── check-npmrc.ts
│   │   ├── check-lockfile.ts
│   │   ├── check-audit.ts
│   │   ├── check-built-deps.ts
│   │   ├── check-only-allow.ts
│   │   ├── check-package-manager.ts
│   │   ├── check-node-version.ts
│   │   ├── check-scripts.ts         # security script check (locksmith in scripts)
│   │   └── python/
│   │       ├── check-poetry.ts
│   │       ├── check-pyproject.ts
│   │       ├── check-poetry-toml.ts
│   │       ├── check-poetry-lock.ts
│   │       ├── check-poetry-audit.ts
│   │       ├── check-dep-groups.ts
│   │       ├── check-python-version.ts
│   │       └── check-pypi-source.ts
│   ├── add/
│   │   ├── index.ts                 # Orchestrator for add/update commands
│   │   ├── registry-client.ts       # npm Registry API (resolveVersion, fetchPackageJson)
│   │   ├── script-inspector.ts      # Pure function: inspects lifecycle scripts
│   │   ├── security-report.ts       # buildReport, determineRiskLevel, printReport
│   │   ├── socket-client.ts         # Socket.dev CLI integration (opt-in)
│   │   ├── installer.ts             # pnpm add / pnpm update --ignore-scripts
│   │   └── shell.ts                 # Mutable shell wrapper (enables test interception)
│   ├── docker/
│   │   ├── analyze-dockerfile.ts    # Detects issues (Node + Python, multi-stage aware)
│   │   ├── fix-dockerfile.ts        # Applies proposedContent to file
│   │   └── prompt-dockerfile.ts     # showDockerWarnings / promptDockerFix
│   ├── outdated/
│   │   ├── index.ts                 # Orchestrator
│   │   ├── classify.ts              # Pure: semver classification + Renovate policy
│   │   ├── fetch-dates.ts           # npm / PyPI registry API
│   │   └── reporter.ts              # Terminal output
│   ├── reporter/
│   │   ├── console.ts               # printReport with colors, badges, hints
│   │   └── export.ts                # JSON / Markdown export
│   └── fixer/
│       └── apply.ts                 # All auto-fix implementations (Node + Python)
├── templates/
│   ├── .npmrc                       # Security .npmrc template
│   ├── poetry.toml                  # poetry.toml template
│   └── renovate.json                # Renovate config template
├── tests/
│   ├── checks.test.ts               # Node + Python checks, fixers, outdated (224 tests)
│   ├── core-properties.test.ts      # Property-based tests — pure functions + Docker flow
│   ├── docker-modes.test.ts         # Orchestrator Docker mode tests
│   └── safe-add/
│       ├── installer.test.ts
│       ├── orchestrator.test.ts
│       ├── registry-client.test.ts
│       ├── script-inspector.test.ts
│       ├── security-report.test.ts
│       └── socket-client.test.ts
└── docs/
    ├── checks-node.md
    ├── checks-python.md
    ├── development.md               ← this file
    ├── dockerfile.md
    ├── outdated.md
    └── safe-add.md
```

---

## Adding a new check

1. Create `src/checks/check-<name>.ts` (or `src/checks/python/check-<name>.ts`)
2. Export `async function check<Name>(projectPath: string): Promise<CheckResult>`
3. Register in `src/checks/index.ts` → `runChecks()` Promise.all array
4. If `fixable: true`: add fixer in `src/fixer/apply.ts`, import lazily inside `fix()`
5. Add tests in `tests/checks.test.ts`: ok path + error path + fix path (all required)

```typescript
export async function checkName(projectPath: string): Promise<CheckResult> {
  const filePath = join(projectPath, "target-file");
  if (!existsSync(filePath)) {
    return {
      name: "display-name",
      status: "error",
      message: "File missing",
      fixable: true,
      fix: async () => {
        const { applyName } = await import("../fixer/apply");
        await applyName(projectPath);
      },
    };
  }
  return { name: "display-name", status: "ok", message: "Valid" };
}
```

---

## Bun shell pattern

Always use Bun shell `$` — never `child_process`, `execa`, or `shelljs`:

```typescript
import { $ } from "bun";
const version = await $`pnpm --version`.text();
await $`pnpm install --no-frozen-lockfile`.quiet();
```

In `src/add/` modules, import from `./shell` instead to allow test interception:

```typescript
import { bunShell } from "./shell";
await bunShell.$`pnpm add ${pkg}@${ver} --ignore-scripts`.cwd(projectPath);
```

---

## Bun 1.3.x — module mocking rules

`mock.module()` is shared across test files in the same worker. Key rules:

- Mock only modules **not** imported by `checks.test.ts` (avoid contamination)
- Use alphabetical file naming to control execution order (`core-` < `docker-`)
- For modules that need shell interception: use the `bunShell` mutable object pattern — `mock.module("bun")` does not intercept Bun built-ins
- Add `afterAll(() => { mock.restore(); })` in files that mock shared modules

---

## References

| Tool | Documentation |
|---|---|
| pnpm | [pnpm.io/motivation](https://pnpm.io/motivation) |
| pnpm security | [pnpm.io/security](https://pnpm.io/security) |
| Poetry | [python-poetry.org/docs](https://python-poetry.org/docs/) |
| Renovate | [docs.renovatebot.com](https://docs.renovatebot.com) |
| Socket.dev | [socket.dev](https://socket.dev) |
