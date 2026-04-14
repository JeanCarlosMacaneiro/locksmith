# Package Updates (`--outdated`)

`locksmith --outdated` adds an update report after the security checks. For each outdated package it shows the available version, how many days ago it was published, and whether it meets the `minimumReleaseAge` policy from `renovate.json`.

```bash
locksmith --outdated           # Show outdated packages
locksmith --outdated --fix     # Auto-apply safe patch updates
```

---

## Example output

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

---

## Update safety rules

| Update type | `--fix` applies? | Reason |
|---|---|---|
| `patch` | **Yes** — only if policy is met | Low risk, no breaking changes |
| `minor` | No — shows manual command | New functionality, possible edge cases |
| `major` | No — shows manual command | Breaking changes, always requires human review |
| Any type within waiting period | No — shows when it will be ready | Too recent to trust |

---

## Renovate policy integration

The waiting periods come from `minimumReleaseAge` in your `renovate.json`. locksmith reads this file to validate each outdated package against the configured delay before flagging it as safe to update.

Default policy (applied when no `renovate.json` is found):

| Update type | Minimum age |
|---|---|
| `patch` | 3 days |
| `minor` | 7 days |
| `major` | 30 days |

If no `renovate.json` is found, a warning is shown and the default policy is applied.

Locksmith accepts `renovate.json` at the project root, `.github/renovate.json`, or `renovate.json5`.

> **Why wait?** The `minimumReleaseAge` delay gives the open source community time to detect newly poisoned package versions before they reach your project. See the [event-stream incident (2018)](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident) as a reference case.

---

## How publish dates are resolved

For each outdated package, locksmith calls the public registry API to get the exact publish date of the latest version:

- **Node.js / Bun:** `https://registry.npmjs.org/<pkg>/<version>`
- **Python:** `https://pypi.org/pypi/<pkg>/<version>/json`

Dates are fetched in parallel to minimize wait time.
