#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$PROJECT_DIR/.cert"
CERT_FILE="$CERT_DIR/localhost.pem"
KEY_FILE="$CERT_DIR/localhost-key.pem"
ENV_FILE="$PROJECT_DIR/.env.local"
BASE_URL="https://localhost:3000"
CALLBACK_URL="$BASE_URL/oauth/feishu/callback"
MCP_URL="$BASE_URL/api/mcp"
MKCERT_VERSION="1.4.4"
SETUP_ONLY=false
CHECK_ONLY=false
RESET_DB=false

info() { printf '\033[1;34m[local-demo]\033[0m %s\n' "$*"; }
success() { printf '\033[1;32m[local-demo]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[local-demo]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: bash scripts/local-demo.sh [--setup-only] [--check] [--reset-db]

  --setup-only  Configure dependencies, environment, certificate and database.
  --check       Read-only validation of the local HTTPS deployment.
  --reset-db    Reset CRM demo data before starting (destructive to local demo data).
EOF
}

for argument in "$@"; do
  case "$argument" in
    --setup-only) SETUP_ONLY=true ;;
    --check) CHECK_ONLY=true ;;
    --reset-db) RESET_DB=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "Unknown argument: $argument" ;;
  esac
done

if $CHECK_ONLY && $RESET_DB; then fail "--check cannot be combined with --reset-db"; fi

cd "$PROJECT_DIR"

os_name() {
  case "$(uname -s)" in
    Darwin) printf 'macos' ;;
    Linux) printf 'linux' ;;
    *) fail "Only macOS and Linux are supported" ;;
  esac
}

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then return; fi
  $CHECK_ONLY && fail "Bun is missing. Run the setup command first."
  info "Installing Bun"
  command -v curl >/dev/null 2>&1 || fail "curl is required to install Bun"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  command -v bun >/dev/null 2>&1 || fail "Bun installation completed but bun is not on PATH"
}

install_linux_certificate_tools() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl libnss3-tools openssl
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y ca-certificates curl nss-tools openssl
  else
    fail "Linux setup currently supports apt or dnf. Install mkcert and NSS tools manually, then rerun."
  fi
}

install_mkcert_binary_linux() {
  local machine asset install_dir
  machine="$(uname -m)"
  case "$machine" in
    x86_64|amd64) asset="mkcert-v${MKCERT_VERSION}-linux-amd64" ;;
    aarch64|arm64) asset="mkcert-v${MKCERT_VERSION}-linux-arm64" ;;
    *) fail "Unsupported Linux architecture for automatic mkcert installation: $machine" ;;
  esac
  install_dir="$HOME/.local/bin"
  mkdir -p "$install_dir"
  curl -fsSL "https://github.com/FiloSottile/mkcert/releases/download/v${MKCERT_VERSION}/${asset}" -o "$install_dir/mkcert"
  chmod 755 "$install_dir/mkcert"
  export PATH="$install_dir:$PATH"
}

ensure_mkcert() {
  if command -v mkcert >/dev/null 2>&1; then return; fi
  $CHECK_ONLY && fail "mkcert is missing. Run the setup command first."
  info "Installing mkcert"
  if [ "$(os_name)" = "macos" ]; then
    command -v brew >/dev/null 2>&1 || fail "Homebrew is required on macOS: https://brew.sh"
    brew install mkcert
  else
    install_linux_certificate_tools
    install_mkcert_binary_linux
  fi
  command -v mkcert >/dev/null 2>&1 || fail "mkcert installation failed"
}

certificate_is_valid() {
  [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ] || return 1
  openssl x509 -in "$CERT_FILE" -checkend 2592000 -noout >/dev/null 2>&1 || return 1
  local text
  text="$(openssl x509 -in "$CERT_FILE" -noout -ext subjectAltName 2>/dev/null || true)"
  printf '%s' "$text" | grep -q 'DNS:localhost' || return 1
  printf '%s' "$text" | grep -q 'IP Address:127.0.0.1' || return 1
}

private_key_permissions() {
  if [ "$(os_name)" = "macos" ]; then stat -f '%Lp' "$KEY_FILE"; else stat -c '%a' "$KEY_FILE"; fi
}

ensure_certificate() {
  ensure_mkcert
  if $CHECK_ONLY; then
    certificate_is_valid || fail "Local certificate is missing, expired, or has invalid SANs"
    [ "$(private_key_permissions)" = "600" ] || fail "Certificate private key permissions must be 0600"
    return
  fi
  info "Installing the local development CA (the OS may request a password or sudo)"
  mkcert -install
  if ! certificate_is_valid; then
    info "Generating localhost certificate"
    mkdir -p "$CERT_DIR"
    mkcert -cert-file "$CERT_FILE" -key-file "$KEY_FILE" localhost 127.0.0.1 ::1
  fi
  chmod 600 "$KEY_FILE"
  success "Local certificate is ready"
}

env_value() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  awk -F= -v key="$key" '$1 == key { value=substr($0,index($0,"=")+1) } END { print value }' "$ENV_FILE"
}

set_env_value() {
  local key="$1" value="$2" temporary found=false line
  temporary="$(mktemp "${TMPDIR:-/tmp}/magic-crm-env.XXXXXX")"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$key"=*) printf '%s=%s\n' "$key" "$value" >>"$temporary"; found=true ;;
      *) printf '%s\n' "$line" >>"$temporary" ;;
    esac
  done <"$ENV_FILE"
  $found || printf '\n%s=%s\n' "$key" "$value" >>"$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$ENV_FILE"
}

configure_environment() {
  if $CHECK_ONLY; then
    [ -f "$ENV_FILE" ] || fail ".env.local is missing"
    [ "$(env_value APP_BASE_URL)" = "$BASE_URL" ] || fail "APP_BASE_URL must be $BASE_URL"
    [ "$(env_value FEISHU_OAUTH_REDIRECT_URI)" = "$CALLBACK_URL" ] || fail "FEISHU_OAUTH_REDIRECT_URI must be $CALLBACK_URL"
    [ -n "$(env_value LARK_APP_ID)" ] || fail "LARK_APP_ID is missing"
    [ -n "$(env_value LARK_APP_SECRET)" ] || fail "LARK_APP_SECRET is missing"
    return
  fi

  if [ ! -f "$ENV_FILE" ]; then cp .env.example "$ENV_FILE"; chmod 600 "$ENV_FILE"; fi
  set_env_value APP_BASE_URL "$BASE_URL"
  set_env_value FEISHU_OAUTH_REDIRECT_URI "$CALLBACK_URL"
  set_env_value MCP_ALLOWED_ORIGINS "https://localhost:3000,https://127.0.0.1:3000"

  local app_id app_secret
  app_id="$(env_value LARK_APP_ID)"
  app_secret="$(env_value LARK_APP_SECRET)"
  if [ -z "$app_id" ]; then
    [ -t 0 ] || fail "LARK_APP_ID is missing; run setup interactively or edit .env.local"
    printf 'Feishu App ID: '
    IFS= read -r app_id
    [ -n "$app_id" ] || fail "Feishu App ID cannot be empty"
    set_env_value LARK_APP_ID "$app_id"
  fi
  if [ -z "$app_secret" ]; then
    [ -t 0 ] || fail "LARK_APP_SECRET is missing; run setup interactively or edit .env.local"
    printf 'Feishu App Secret (input hidden): '
    IFS= read -rs app_secret
    printf '\n'
    [ -n "$app_secret" ] || fail "Feishu App Secret cannot be empty"
    set_env_value LARK_APP_SECRET "$app_secret"
  fi
  chmod 600 "$ENV_FILE"
  success "Environment is configured without exposing credentials"
}

verify_running_service() {
  command -v curl >/dev/null 2>&1 || fail "curl is required for health checks"
  curl -fsS "$BASE_URL/api/health" >/dev/null || fail "HTTPS health check failed: $BASE_URL/api/health"
  local metadata
  metadata="$(curl -fsS "$BASE_URL/.well-known/oauth-authorization-server")"
  printf '%s' "$metadata" | grep -q '"authorization_endpoint":"https://localhost:3000/oauth/authorize"' || fail "OAuth metadata is not using the expected HTTPS authorization endpoint"
  success "HTTPS certificate, health check and OAuth metadata are valid"
}

ensure_bun
ensure_certificate
configure_environment

if $CHECK_ONLY; then
  verify_running_service
  printf '\nCRM:             %s\nMCP connector:   %s\nFeishu callback: %s\n' "$BASE_URL" "$MCP_URL" "$CALLBACK_URL"
  exit 0
fi

info "Installing project dependencies"
bun install --frozen-lockfile

if $RESET_DB; then
  info "Resetting local CRM demo data"
  bun run db:reset
else
  bun run db:init
fi

success "Local setup is complete"
printf '\nRegister this exact URL in Feishu Open Platform:\n  %s\n' "$CALLBACK_URL"
printf 'Use this connector URL in Doubao local MCP injection:\n  %s\n\n' "$MCP_URL"

$SETUP_ONLY && exit 0

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  fail "Port 3000 is already in use. Stop the existing process, then rerun."
fi

info "Starting the HTTPS demo server"
bun run dev &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' INT TERM EXIT

attempt=0
until curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if ! kill -0 "$server_pid" 2>/dev/null; then wait "$server_pid"; fail "Next.js exited before becoming healthy"; fi
  [ "$attempt" -lt 60 ] || fail "Timed out waiting for $BASE_URL"
  sleep 1
done

verify_running_service
printf '\nCRM:             %s\nDemo console:    %s/demo\nMCP connector:   %s\nFeishu callback: %s\n\n' "$BASE_URL" "$BASE_URL" "$MCP_URL" "$CALLBACK_URL"
wait "$server_pid"
