#Requires -Version 5.1
$ErrorActionPreference = "Stop"

# ─── colors ──────────────────────────────────────────────────────────────────
function ok   { param($msg) Write-Host "  " -NoNewline; Write-Host "✓" -ForegroundColor Green  -NoNewline; Write-Host " $msg" }
function warn { param($msg) Write-Host "  " -NoNewline; Write-Host "⚠" -ForegroundColor Yellow -NoNewline; Write-Host "  $msg" }
function err  { param($msg) Write-Host "  " -NoNewline; Write-Host "✗" -ForegroundColor Red    -NoNewline; Write-Host " $msg" }
function info { param($msg) Write-Host "  " -NoNewline; Write-Host "→" -ForegroundColor Cyan   -NoNewline; Write-Host " $msg" }
function step { param($msg) Write-Host "`n$msg" -ForegroundColor White }

# ─── header ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🔐 locksmith — instalador" -ForegroundColor White
Write-Host "  Verificando requisitos e instalando..." -ForegroundColor DarkGray

# ─── resolve script dir ───────────────────────────────────────────────────────
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# ─── step 1: bun ─────────────────────────────────────────────────────────────
step "1/5  Verificando Bun"

if (Get-Command bun -ErrorAction SilentlyContinue) {
    $bunVersion = bun --version
    ok "Bun $bunVersion encontrado"
} else {
    warn "Bun no está instalado — instalando..."
    try {
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
        $env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"
        if (Get-Command bun -ErrorAction SilentlyContinue) {
            ok "Bun instalado correctamente"
        } else {
            throw "Bun instalado pero no disponible en PATH"
        }
    } catch {
        err "No se pudo instalar Bun: $_"
        info "Instálalo manualmente desde: https://bun.sh"
        exit 1
    }
}

# ─── step 2: pnpm ────────────────────────────────────────────────────────────
step "2/5  Verificando pnpm"

if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $pnpmVersion = pnpm --version
    $pnpmMajor   = [int]($pnpmVersion -split "\.")[0]
    if ($pnpmMajor -lt 8) {
        warn "pnpm $pnpmVersion encontrado — se recomienda v8+"
    } else {
        ok "pnpm $pnpmVersion encontrado"
    }
} else {
    warn "pnpm no está instalado — instalando..."
    try {
        bun add -g pnpm
        ok "pnpm instalado correctamente"
    } catch {
        err "No se pudo instalar pnpm: $_"
        info "Instálalo manualmente desde: https://pnpm.io"
        exit 1
    }
}

# ─── step 3: dependencias ────────────────────────────────────────────────────
step "3/5  Instalando dependencias"

Set-Location $SCRIPT_DIR

if ($env:CI) {
    info "Entorno CI detectado — usando --frozen-lockfile"
    pnpm install --ignore-scripts --frozen-lockfile
} else {
    pnpm install --ignore-scripts --no-frozen-lockfile
}

ok "Dependencias instaladas"

# ─── step 4: crear wrapper ───────────────────────────────────────────────────
step "4/5  Registrando comando locksmith"

$BUN_BIN_DIR = "$env:USERPROFILE\.bun\bin"
$CLI_PATH    = Join-Path $SCRIPT_DIR "bin\cli.ts"
$WRAPPER     = Join-Path $BUN_BIN_DIR "locksmith.cmd"

if (-not (Test-Path $BUN_BIN_DIR)) {
    New-Item -ItemType Directory -Path $BUN_BIN_DIR | Out-Null
}

# Sobreescribir wrapper si ya existe
Set-Content -Path $WRAPPER -Value "@echo off`nbun `"$CLI_PATH`" %*"

ok "Wrapper creado: $WRAPPER"

# ─── step 5: configurar clientes AI ──────────────────────────────────────────
step "5/5  Configurando clientes AI"
bun "$SCRIPT_DIR\bin\register-mcp.ts" --clients claude-desktop

# ─── PATH ─────────────────────────────────────────────────────────────────────
$NEEDS_RELOAD = $false

if ($env:PATH -split ";" | Where-Object { $_ -eq $BUN_BIN_DIR }) {
    ok "$BUN_BIN_DIR ya está en PATH"
} else {
    $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")

    if ($userPath -notlike "*$BUN_BIN_DIR*") {
        [System.Environment]::SetEnvironmentVariable("PATH", "$BUN_BIN_DIR;$userPath", "User")
        ok "PATH actualizado permanentemente"
    } else {
        ok "$BUN_BIN_DIR ya estaba configurado en PATH"
    }

    $env:PATH = "$BUN_BIN_DIR;$env:PATH"
    $NEEDS_RELOAD = $true
}

# ─── verificación final ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "──────────────────────────────────────────" -ForegroundColor DarkGray

if (Get-Command locksmith -ErrorAction SilentlyContinue) {
    Write-Host ""
    Write-Host "  ✓ locksmith instalado correctamente" -ForegroundColor Green
    Write-Host ""
    info "Uso:      locksmith C:\ruta\a\tu\proyecto"
    info "Auto-fix: locksmith C:\ruta\a\tu\proyecto --fix"
    info "Reporte:  locksmith C:\ruta\a\tu\proyecto --report json"
    if ($NEEDS_RELOAD) {
        Write-Host ""
        warn "Abre una nueva terminal para que el PATH persista en futuras sesiones."
    }
} else {
    Write-Host ""
    Write-Host "  ⚠  Instalado — abre una nueva terminal para activar el comando" -ForegroundColor Yellow
    Write-Host ""
    info "Luego prueba: locksmith --version"
}

Write-Host ""
