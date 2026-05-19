# Package Updates (`--outdated`)

`locksmith --outdated` adds an update report after the security checks. For each outdated package it shows the available version, how many days ago it was published, and whether it meets the `minimumReleaseAge` policy from `renovate.json`.

```bash
locksmith --outdated           # Show outdated packages
locksmith --outdated --fix     # Auto-apply safe patch updates
locksmith --config             # Configure policy thresholds interactively
```

---

## Example output

```
📦 Outdated packages

  PATCH  — policy: 3d · no breaking changes
  ────────────────────────────────────────────────────────────────────────
  ✓ picocolors   1.1.1 → 1.2.0   published 5d ago    ✅ policy ok (3d)    $ pnpm update picocolors
  ⏳ is-odd       3.0.0 → 3.0.1   published 1d ago    ⏳ too recent (waiting 2d)

  MINOR  — policy: 7d · new functionality — review changelog
  ────────────────────────────────────────────────────────────────────────
  ✓ yargs        17.7.2 → 18.0.0  published 12d ago   ✅ policy ok (7d)    $ pnpm update yargs

  MAJOR  — policy: 30d · possible breaking changes — manual review required
  ────────────────────────────────────────────────────────────────────────
  ⏳ typescript   5.9.3 → 6.0.2   published 8d ago    ⏳ too recent (waiting 22d)

  2 patch(es) ready for --fix · 1 require manual review · 2 in waiting period

  Safe patches available → run: locksmith . --outdated --fix

  Waiting period:
    is-odd      available in 2d
    typescript  available in 22d
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

### Customising policy thresholds

Run `locksmith --config` to interactively set per-project thresholds:

```
Locksmith — Outdated Policy

  major            [30d] →
  minor            [ 7d] →
  patch (not met)  [ 3d] →
  patch (met)      [ 3d]   (same threshold — safe to auto-fix when met)
```

Press Enter to keep the current value. Any field left blank is unchanged. Values are saved to `.locksmith.json` in the project root.

**Priority chain** (highest wins):

1. `.locksmith.json` — values set via `--config`
2. `renovate.json` — existing Renovate configuration
3. Built-in defaults — `patch: 3d · minor: 7d · major: 30d`

`.locksmith.json` shape:

```json
{
  "outdatedPolicy": {
    "major": 30,
    "minor": 7,
    "patch": 3
  }
}
```

Only the fields you changed are written. The file can be committed to version control to share policy across the team.

> **Why wait?** The `minimumReleaseAge` delay gives the open source community time to detect newly poisoned package versions before they reach your project. See the [event-stream incident (2018)](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident) as a reference case.

---

## How publish dates are resolved

For each outdated package, locksmith calls the public registry API to get the exact publish date of the latest version:

- **Node.js / Bun:** `https://registry.npmjs.org/<pkg>/<version>`
- **Python:** `https://pypi.org/pypi/<pkg>/<version>/json`

Dates are fetched in parallel to minimize wait time.
