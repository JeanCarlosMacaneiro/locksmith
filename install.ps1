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
Write-Host "🔐 locksmith — installer" -ForegroundColor White
Write-Host "  Checking requirements and installing..." -ForegroundColor DarkGray

# ─── resolve script dir ───────────────────────────────────────────────────────
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# ─── step 1: bun ─────────────────────────────────────────────────────────────
step "1/5  Checking Bun"

if (Get-Command bun -ErrorAction SilentlyContinue) {
    $bunVersion = bun --version
    ok "Bun $bunVersion found"
} else {
    warn "Bun not installed — installing..."
    try {
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
        $env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"
        if (Get-Command bun -ErrorAction SilentlyContinue) {
            ok "Bun installed successfully"
        } else {
            throw "Bun installed but not available in PATH"
        }
    } catch {
        err "Could not install Bun: $_"
        info "Install manually from: https://bun.sh"
        exit 1
    }
}

# ─── step 2: pnpm ────────────────────────────────────────────────────────────
step "2/5  Checking pnpm"

if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $pnpmVersion = pnpm --version
    $pnpmMajor   = [int]($pnpmVersion -split "\.")[0]
    if ($pnpmMajor -lt 11) {
        warn "pnpm $pnpmVersion found — v11+ required"
    } else {
        ok "pnpm $pnpmVersion found"
    }
} else {
    warn "pnpm not installed — installing..."
    try {
        bun add -g pnpm
        ok "pnpm installed successfully"
    } catch {
        err "Could not install pnpm: $_"
        info "Install manually from: https://pnpm.io"
        exit 1
    }
}

# ─── step 3: dependencies ────────────────────────────────────────────────────
step "3/5  Installing dependencies"

Set-Location $SCRIPT_DIR

if ($env:CI) {
    info "CI environment detected — using --frozen-lockfile"
    pnpm install --ignore-scripts --frozen-lockfile
} else {
    pnpm install --ignore-scripts --no-frozen-lockfile
}

ok "Dependencies installed"

# ─── step 4: crear wrapper ───────────────────────────────────────────────────
step "4/5  Registering locksmith command"

$BUN_BIN_DIR = "$env:USERPROFILE\.bun\bin"
$CLI_PATH    = Join-Path $SCRIPT_DIR "bin\cli.ts"
$WRAPPER     = Join-Path $BUN_BIN_DIR "locksmith.cmd"

if (-not (Test-Path $BUN_BIN_DIR)) {
    New-Item -ItemType Directory -Path $BUN_BIN_DIR | Out-Null
}

Set-Content -Path $WRAPPER -Value "@echo off`nbun `"$CLI_PATH`" %*"

ok "Wrapper created: $WRAPPER"

# ─── step 5: configure AI clients ────────────────────────────────────────────
step "5/5  Configuring AI clients"
bun "$SCRIPT_DIR\bin\register-mcp.ts" --clients claude-desktop
info "To add other clients (Cursor, Windsurf, Cline, Kiro): bun $SCRIPT_DIR\bin\register-mcp.ts"

# ─── PATH ─────────────────────────────────────────────────────────────────────
$NEEDS_RELOAD = $false

if ($env:PATH -split ";" | Where-Object { $_ -eq $BUN_BIN_DIR }) {
    ok "$BUN_BIN_DIR already in PATH"
} else {
    $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")

    if ($userPath -notlike "*$BUN_BIN_DIR*") {
        [System.Environment]::SetEnvironmentVariable("PATH", "$BUN_BIN_DIR;$userPath", "User")
        ok "PATH updated permanently"
    } else {
        ok "$BUN_BIN_DIR already configured in PATH"
    }

    $env:PATH = "$BUN_BIN_DIR;$env:PATH"
    $NEEDS_RELOAD = $true
}

# ─── final verification ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "──────────────────────────────────────────" -ForegroundColor DarkGray

if (Get-Command locksmith -ErrorAction SilentlyContinue) {
    Write-Host ""
    Write-Host "  ✓ locksmith installed successfully" -ForegroundColor Green
    Write-Host ""
    info "Usage:           locksmith C:\path\to\your\project"
    info "Auto-fix:        locksmith C:\path\to\your\project --fix"
    info "Report:          locksmith C:\path\to\your\project --report json"
    info "Per-project MCP: locksmith C:\path\to\your\project --install-mcp"
    if ($NEEDS_RELOAD) {
        Write-Host ""
        warn "Open a new terminal to persist PATH in future sessions."
    }
} else {
    Write-Host ""
    Write-Host "  ⚠  Installed — open a new terminal to activate the command" -ForegroundColor Yellow
    Write-Host ""
    info "Then try: locksmith --version"
}

Write-Host ""
