# Development

## Requirements

| Tool | Version |
|---|---|
| [Bun](https://bun.sh) | `>= 1.0` |
| [pnpm](https://pnpm.io) | `>= 8.0` |

## Setup

```bash
pnpm install   # Install dependencies
bun run dev    # Run CLI in dev mode
bun test       # Run tests
bun run lint   # Type check
bun run build  # Build
```

---

## Project structure

```
locksmith/
├── bin/
│   └── cli.ts                       # CLI entry point (yargs)
├── src/
│   ├── checks/
│   │   ├── index.ts                 # Orchestrator — detects language, runs checks in parallel
│   │   ├── detect-project.ts        # Detects project type (node / bun / python)
│   │   ├── check-renovate.ts        # Renovate check (shared)
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
│   │   └── python/
│   │       ├── check-poetry.ts
│   │       ├── check-pyproject.ts
│   │       ├── check-poetry-toml.ts
│   │       ├── check-poetry-lock.ts
│   │       ├── check-poetry-audit.ts
│   │       ├── check-dep-groups.ts
│   │       ├── check-python-version.ts
│   │       └── check-pypi-source.ts
│   ├── outdated/
│   │   ├── index.ts                 # Orchestrator — runs pnpm/poetry outdated
│   │   ├── classify.ts              # Pure functions: semver classification + Renovate policy
│   │   ├── fetch-dates.ts           # Publish date lookup via npm / PyPI registry API
│   │   └── reporter.ts              # Terminal output for outdated packages
│   ├── reporter/
│   │   ├── console.ts               # Terminal output + contextual hints
│   │   └── export.ts                # JSON / Markdown export
│   ├── fixer/
│   │   └── apply.ts                 # All auto-fix implementations (Node + Python)
│   └── types.ts                     # TypeScript interfaces
├── templates/
│   ├── .npmrc                       # Security .npmrc template
│   ├── poetry.toml                  # poetry.toml template
│   └── renovate.json                # Renovate config template
├── tests/
│   └── checks.test.ts               # Tests (Node + Python checks, fixers, outdated)
├── docs/                            # Extended documentation
├── install.sh                       # Installer for macOS / Linux
└── install.ps1                      # Installer for Windows (PowerShell)
```

---

## Adding a new check

1. Create `src/checks/check-<name>.ts` — export an `async function check<Name>(projectPath: string): Promise<CheckResult>`
2. Add the fixer (if applicable) in `src/fixer/apply.ts`
3. Import and add the check to the appropriate array in `src/checks/index.ts`
4. Add tests in `tests/checks.test.ts`

The `CheckResult` type:

```typescript
interface CheckResult {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  fixable?: boolean;
  fix?: () => Promise<void>;
  hint?: string[];
}
```

---

## References

| Tool | Documentation |
|---|---|
| pnpm | [pnpm.io/motivation](https://pnpm.io/motivation) |
| pnpm security | [pnpm.io/security](https://pnpm.io/security) |
| Poetry | [python-poetry.org/docs](https://python-poetry.org/docs/) |
| Renovate | [docs.renovatebot.com](https://docs.renovatebot.com) |
| Socket.dev | [socket.dev](https://socket.dev) |
| git-filter-repo | [github.com/newren/git-filter-repo](https://github.com/newren/git-filter-repo) |
