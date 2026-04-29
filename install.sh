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
echo -e "${BOLD}🔐 locksmith — instalador${RESET}"
echo -e "${DIM}  Verificando requisitos e instalando...${RESET}"

# ─── resolve script dir (works even if called from another path) ─────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_ENTRY="$SCRIPT_DIR/bin/mcp.ts"

# ─── step 1: bun ─────────────────────────────────────────────────────────────
step "1/5  Verificando Bun"

if command -v bun &>/dev/null; then
  BUN_VERSION=$(bun --version)
  ok "Bun $BUN_VERSION encontrado"
else
  warn "Bun no está instalado — instalando..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  if command -v bun &>/dev/null; then
    ok "Bun instalado correctamente"
  else
    err "No se pudo instalar Bun. Instálalo manualmente: https://bun.sh"
    exit 1
  fi
fi

# ─── step 2: pnpm ────────────────────────────────────────────────────────────
step "2/5  Verificando pnpm"

if command -v pnpm &>/dev/null; then
  PNPM_VERSION=$(pnpm --version)
  PNPM_MAJOR=$(echo "$PNPM_VERSION" | cut -d. -f1)
  if [ "$PNPM_MAJOR" -lt 8 ]; then
    warn "pnpm $PNPM_VERSION encontrado — se recomienda v8+"
  else
    ok "pnpm $PNPM_VERSION encontrado"
  fi
else
  warn "pnpm no está instalado — instalando..."
  bun add -g pnpm
  if command -v pnpm &>/dev/null; then
    ok "pnpm instalado correctamente"
  else
    err "No se pudo instalar pnpm. Instálalo manualmente: https://pnpm.io"
    exit 1
  fi
fi

# ─── step 3: dependencias ────────────────────────────────────────────────────
step "3/5  Instalando dependencias"

cd "$SCRIPT_DIR"

if [ -n "$CI" ]; then
  info "Entorno CI detectado — usando --frozen-lockfile"
  pnpm install --ignore-scripts --frozen-lockfile
else
  pnpm install --ignore-scripts --no-frozen-lockfile
fi

ok "Dependencias instaladas"

# ─── step 4: symlink global ──────────────────────────────────────────────────
step "4/5  Registrando comando locksmith"

BUN_BIN_DIR="$HOME/.bun/bin"
TARGET="$SCRIPT_DIR/bin/cli.ts"
LINK="$BUN_BIN_DIR/locksmith"

mkdir -p "$BUN_BIN_DIR"

[ -e "$LINK" ] || [ -L "$LINK" ] && rm -f "$LINK"

ln -sf "$TARGET" "$LINK"
chmod +x "$TARGET"
chmod +x "$MCP_ENTRY"
ok "Symlink creado: $LINK → $TARGET"

# ─── step 5: configurar clientes AI ──────────────────────────────────────────
step "5/5  Configurando clientes AI"
bun "$SCRIPT_DIR/bin/register-mcp.ts" --clients claude-desktop

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
  ok "~/.bun/bin ya está en PATH"
elif [ -n "$SHELL_RC" ]; then
  if ! grep -qF "$BUN_BIN_DIR" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# locksmith — bun bin path" >> "$SHELL_RC"
    echo "$EXPORT_LINE" >> "$SHELL_RC"
    ok "PATH agregado en $SHELL_RC"
  else
    ok "~/.bun/bin configurado en $SHELL_RC"
  fi
  export PATH="$BUN_BIN_DIR:$PATH"
  NEEDS_RELOAD=true
else
  warn "No se pudo detectar el shell RC. Agrega manualmente a tu perfil:"
  info "$EXPORT_LINE"
  export PATH="$BUN_BIN_DIR:$PATH"
  NEEDS_RELOAD=true
fi

# ─── verificación final ──────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}──────────────────────────────────────────${RESET}"

if command -v locksmith &>/dev/null; then
  echo -e "\n  ${GREEN}${BOLD}✓ locksmith instalado correctamente${RESET}\n"
  info "Uso:        ${BOLD}locksmith /ruta/a/tu/proyecto${RESET}"
  info "Auto-fix:   ${BOLD}locksmith /ruta/a/tu/proyecto --fix${RESET}"
  if [ "$NEEDS_RELOAD" = true ] && [ -n "$SHELL_RC" ]; then
    echo ""
    warn "Recarga el shell para que el PATH persista en nuevas sesiones:"
    echo -e "    ${BOLD}source $SHELL_RC${RESET}"
  fi
else
  echo -e "\n  ${YELLOW}${BOLD}⚠  Instalado — recarga el shell para activar el comando${RESET}\n"
  if [ -n "$SHELL_RC" ]; then
    echo -e "    ${BOLD}source $SHELL_RC${RESET}"
  else
    echo -e "    ${BOLD}export PATH=\"\$HOME/.bun/bin:\$PATH\"${RESET}"
  fi
  echo ""
  info "Luego prueba: ${BOLD}locksmith --version${RESET}"
fi

echo ""
