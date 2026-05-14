# Electron security checks

Tres checks adicionales que se ejecutan solo cuando `projectType === "electron"`.

---

## `electron-csp` — Content Security Policy

**Qué detecta:** ausencia de CSP en el proceso main o en el HTML del renderer.

**Busca en:**
- Archivo main (detectado por `package.json.main` o candidatos comunes)
- Patrones: `Content-Security-Policy`, `onHeadersReceived`, `defaultSession`
- HTML candidates: `index.html`, `src/index.html`, `public/index.html`

**Statuses:**
- `ok` — CSP encontrada en main process o HTML
- `warn` — no se encontró archivo main para verificar
- `error` — no se encontró CSP en ninguna ubicación

**Resolución:**
```typescript
// Opción A — main process
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      "Content-Security-Policy": ["default-src 'self'"],
    },
  });
});

// Opción B — HTML renderer
<meta http-equiv="Content-Security-Policy" content="default-src 'self'">
```

---

## `electron-node-integration` — nodeIntegration / contextIsolation

**Qué detecta:** configuración insegura de `webPreferences` en `BrowserWindow`.

**Patrones detectados:**
- `/nodeIntegration\s*:\s*true/` → RCE risk (renderer accede a Node.js directamente)
- `/contextIsolation\s*:\s*false/` → renderer comparte contexto con Node.js

**Statuses:**
- `ok` — no se detectaron configuraciones inseguras
- `warn` — no se encontró archivo main
- `error` — patrón inseguro detectado

**Resolución:**
```typescript
new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,   // ← obligatorio
    contextIsolation: true,   // ← obligatorio
    sandbox: true,            // recomendado
    preload: path.join(__dirname, "preload.js"),
  },
});

// En preload.js — exponer APIs de forma segura
contextBridge.exposeInMainWorld("api", {
  send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
});
```

---

## `electron-rebuild` — native modules rebuild

**Qué detecta:** `electron-rebuild` o `@electron/rebuild` configurado de forma insegura (en postinstall).

**Lógica:**
1. Si `@electron/rebuild` / `electron-rebuild` no está en devDependencies → `warn`
2. Si está en `scripts.postinstall` → `error` (ejecuta sin control al instalar)
3. Si está en devDeps y NO en postinstall → `ok`

**Fix automático disponible:** mueve electron-rebuild del postinstall a un script explícito `rebuild`.

**Resolución manual:**
```json
{
  "scripts": {
    "rebuild": "electron-rebuild",
    "postinstall": "otro-script-si-existe"
  }
}
```

**Por qué importa:** `postinstall` se ejecuta automáticamente con cada `pnpm install`. Un rebuild implícito puede compilar código nativo sin que el desarrollador lo sepa, aumentando la superficie de ataque.

**onlyBuiltDependencies recomendado** para proyectos Electron con módulos nativos:
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
