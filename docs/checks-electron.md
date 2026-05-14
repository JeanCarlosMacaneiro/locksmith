# Electron security checks

Three additional checks that run only when `projectType === "electron"`.

---

## `electron-csp` — Content Security Policy

**What it detects:** absence of CSP in the main process or in the HTML renderer.

**Searches in:**
- Main file (detected via `package.json.main` or common candidates)
- Patterns: `Content-Security-Policy`, `onHeadersReceived`, `defaultSession`
- HTML candidates: `index.html`, `src/index.html`, `public/index.html`

**Statuses:**
- `ok` — CSP found in main process or HTML
- `warn` — main file not found for inspection
- `error` — CSP not found in any location

**Resolution:**
```typescript
// Option A — main process
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      "Content-Security-Policy": ["default-src 'self'"],
    },
  });
});

// Option B — HTML renderer
<meta http-equiv="Content-Security-Policy" content="default-src 'self'">
```

---

## `electron-node-integration` — nodeIntegration / contextIsolation

**What it detects:** unsafe `webPreferences` configuration in `BrowserWindow`.

**Patterns detected:**
- `/nodeIntegration\s*:\s*true/` → RCE risk (renderer accesses Node.js directly)
- `/contextIsolation\s*:\s*false/` → renderer shares context with Node.js

**Statuses:**
- `ok` — no unsafe configurations detected
- `warn` — main file not found
- `error` — unsafe pattern detected

**Resolution:**
```typescript
new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,   // ← required
    contextIsolation: true,   // ← required
    sandbox: true,            // recommended
    preload: path.join(__dirname, "preload.js"),
  },
});

// In preload.js — expose APIs safely
contextBridge.exposeInMainWorld("api", {
  send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
});
```

---

## `electron-rebuild` — native modules rebuild

**What it detects:** `electron-rebuild` or `@electron/rebuild` configured unsafely (in postinstall).

**Logic:**
1. If `@electron/rebuild` / `electron-rebuild` not in devDependencies → `warn`
2. If in `scripts.postinstall` → `error` (runs uncontrolled on every install)
3. If in devDeps and NOT in postinstall → `ok`

**Auto-fix available:** moves electron-rebuild from postinstall to an explicit `rebuild` script.

**Manual resolution:**
```json
{
  "scripts": {
    "rebuild": "electron-rebuild",
    "postinstall": "other-script-if-needed"
  }
}
```

**Why it matters:** `postinstall` runs automatically on every `pnpm install`. An implicit rebuild compiles native code without the developer's awareness, increasing the attack surface.

**`onlyBuiltDependencies` recommended** for Electron projects with native modules:
```json
{
  "pnpm": {
    "onlyBuiltDependencies": [
      "@electron/rebuild",
      "electron",
      "better-sqlite3",
      "serialport",
      "sharp",
      "canvas"
    ]
  }
}
```
