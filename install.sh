#!/usr/bin/env bash
set -e

# ─── colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
err()  { echo -e "  ${RED}✗${RESET} $1"; }
info() { echo -e "  ${CYAN}→${RESET} $1"; }
step() { echo -e "\n${BOLD}$1${RESET}"; }

# ─── header ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}🔐 locksmith — installer${RESET}"
echo -e "${DIM}  Checking requirements and installing...${RESET}"

# ─── resolve script dir (works even if called from another path) ─────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_ENTRY="$SCRIPT_DIR/bin/mcp.ts"

# ─── step 1: bun ─────────────────────────────────────────────────────────────
step "1/5  Checking Bun"

if command -v bun &>/dev/null; then
  BUN_VERSION=$(bun --version)
  ok "Bun $BUN_VERSION found"
else
  warn "Bun not installed — installing..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  if command -v bun &>/dev/null; then
    ok "Bun installed successfully"
  else
    err "Could not install Bun. Install manually: https://bun.sh"
    exit 1
  fi
fi

# ─── step 2: pnpm ────────────────────────────────────────────────────────────
step "2/5  Checking pnpm"

if command -v pnpm &>/dev/null; then
  PNPM_VERSION=$(pnpm --version)
  PNPM_MAJOR=$(echo "$PNPM_VERSION" | cut -d. -f1)
  if [ "$PNPM_MAJOR" -lt 11 ]; then
    warn "pnpm $PNPM_VERSION found — v11+ required"
  else
    ok "pnpm $PNPM_VERSION found"
  fi
else
  warn "pnpm not installed — installing..."
  bun add -g pnpm
  if command -v pnpm &>/dev/null; then
    ok "pnpm installed successfully"
  else
    err "Could not install pnpm. Install manually: https://pnpm.io"
    exit 1
  fi
fi

# ─── step 3: dependencies ────────────────────────────────────────────────────
step "3/5  Installing dependencies"

cd "$SCRIPT_DIR"

if [ -n "$CI" ]; then
  info "CI environment detected — using --frozen-lockfile"
  pnpm install --ignore-scripts --frozen-lockfile
else
  pnpm install --ignore-scripts --no-frozen-lockfile
fi

ok "Dependencies installed"

# ─── step 4: symlink global ──────────────────────────────────────────────────
step "4/5  Registering locksmith command"

BUN_BIN_DIR="$HOME/.bun/bin"
TARGET="$SCRIPT_DIR/bin/cli.ts"
LINK="$BUN_BIN_DIR/locksmith"

mkdir -p "$BUN_BIN_DIR"

[ -e "$LINK" ] || [ -L "$LINK" ] && rm -f "$LINK"

ln -sf "$TARGET" "$LINK"
chmod +x "$TARGET"
chmod +x "$MCP_ENTRY"
ok "Symlink created: $LINK → $TARGET"

# ─── step 5: configure AI clients ────────────────────────────────────────────
step "5/5  Configuring AI clients"
"$LINK" register-mcp
info "To reconfigure or add more clients: ${BOLD}locksmith register-mcp${RESET}"

# ─── PATH ─────────────────────────────────────────────────────────────────────

SHELL_RC=""
if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

EXPORT_LINE='export PATH="$HOME/.bun/bin:$PATH"'

NEEDS_RELOAD=false

if echo "$PATH" | grep -q "$BUN_BIN_DIR"; then
  ok "~/.bun/bin already in PATH"
elif [ -n "$SHELL_RC" ]; then
  if ! grep -qF "$BUN_BIN_DIR" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# locksmith — bun bin path" >> "$SHELL_RC"
    echo "$EXPORT_LINE" >> "$SHELL_RC"
    ok "PATH added to $SHELL_RC"
  else
    ok "~/.bun/bin already configured in $SHELL_RC"
  fi
  export PATH="$BUN_BIN_DIR:$PATH"
  NEEDS_RELOAD=true
else
  warn "Could not detect shell RC. Add manually to your profile:"
  info "$EXPORT_LINE"
  export PATH="$BUN_BIN_DIR:$PATH"
  NEEDS_RELOAD=true
fi

# ─── final verification ──────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}──────────────────────────────────────────${RESET}"

if command -v locksmith &>/dev/null; then
  echo -e "\n  ${GREEN}${BOLD}✓ locksmith installed successfully${RESET}\n"
  info "Usage:      ${BOLD}locksmith /path/to/your/project${RESET}"
  info "Auto-fix:   ${BOLD}locksmith /path/to/your/project --fix${RESET}"
  info "Per-project rules: ${BOLD}locksmith /path/to/your/project --install-mcp${RESET}"
  if [ "$NEEDS_RELOAD" = true ] && [ -n "$SHELL_RC" ]; then
    echo ""
    warn "Reload shell to persist PATH in new sessions:"
    echo -e "    ${BOLD}source $SHELL_RC${RESET}"
  fi
else
  echo -e "\n  ${YELLOW}${BOLD}⚠  Installed — reload shell to activate the command${RESET}\n"
  if [ -n "$SHELL_RC" ]; then
    echo -e "    ${BOLD}source $SHELL_RC${RESET}"
  else
    echo -e "    ${BOLD}export PATH=\"\$HOME/.bun/bin:\$PATH\"${RESET}"
  fi
  echo ""
  info "Then try: ${BOLD}locksmith --version${RESET}"
fi

echo ""
