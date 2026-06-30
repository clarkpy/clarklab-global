#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

TUNNEL_NAME="${1:-clarklab-api}"
API_HOSTNAME="${2:-api.yourdomain.com}"
BASE_DOMAIN="${3:-yourdomain.com}"
WILDCARD_HOSTNAME="*.${BASE_DOMAIN}"
CONFIG_DIR="/etc/cloudflared"
export CLOUDFLARED_HOME="$CONFIG_DIR"

migrate_legacy_cloudflared() {
  local legacy="${HOME}/.cloudflared"
  [[ -d "$legacy" ]] || return 0

  mkdir -p "$CONFIG_DIR"
  shopt -s nullglob
  for file in "$legacy"/cert.pem "$legacy"/*.json; do
    [[ -f "$file" ]] || continue
    local name
    name="$(basename "$file")"
    if [[ -f "$CONFIG_DIR/$name" ]]; then
      continue
    fi
    install -m 600 "$file" "$CONFIG_DIR/$name"
    echo "Migrated ${file} -> ${CONFIG_DIR}/${name}"
  done
  shopt -u nullglob
}

install_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    return 0
  fi

  echo "Installing cloudflared..."
  local arch cf_arch tmp_deb
  arch="$(uname -m)"
  case "$arch" in
    x86_64) cf_arch=amd64 ;;
    aarch64|arm64) cf_arch=arm64 ;;
    *) echo "Unsupported architecture: $arch"; exit 1 ;;
  esac
  tmp_deb="$(mktemp --suffix=.deb)"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cf_arch}.deb" \
    -o "$tmp_deb"
  dpkg -i "$tmp_deb"
  rm -f "$tmp_deb"
}

ensure_login() {
  if [[ -f "$CONFIG_DIR/cert.pem" ]]; then
    return 0
  fi

  echo "Log in to Cloudflare (opens browser or paste URL):"
  cloudflared tunnel login
}

ensure_tunnel() {
  if cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2 == n { found=1; exit } END { exit !found }'; then
    return 0
  fi

  cloudflared tunnel create "$TUNNEL_NAME"
}

resolve_tunnel_uuid() {
  cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2 == n { print $1; exit }'
}

ensure_credentials() {
  local uuid="$1"
  local dest="$CONFIG_DIR/${uuid}.json"

  if [[ -f "$dest" ]]; then
    chmod 600 "$dest"
    return 0
  fi

  local legacy="${HOME}/.cloudflared/${uuid}.json"
  if [[ -f "$legacy" ]]; then
    install -m 600 "$legacy" "$dest"
    echo "Copied tunnel credentials to ${dest}"
    return 0
  fi

  echo "Tunnel credentials not found at ${dest}"
  echo "Delete the orphaned tunnel, then re-run this script:"
  echo "  cloudflared tunnel delete ${TUNNEL_NAME}"
  exit 1
}

write_config() {
  local uuid="$1"
  local creds="$2"

  cat > "$CONFIG_DIR/config.yml" <<EOF
tunnel: ${uuid}
credentials-file: ${creds}

ingress:
  - hostname: ${API_HOSTNAME}
    service: http://127.0.0.1:3000
  - hostname: "*.${BASE_DOMAIN}"
    service: http://127.0.0.1:8080
  - service: http_status:404
EOF

  chmod 600 "$CONFIG_DIR/config.yml"
}

validate_config() {
  if ! cloudflared --config "$CONFIG_DIR/config.yml" tunnel ingress validate; then
    echo "Invalid tunnel config at ${CONFIG_DIR}/config.yml"
    exit 1
  fi
}

install_service() {
  local script_dir
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  install -m 644 "$script_dir/../deploy/cloudflared/clarklab-tunnel.service" /etc/systemd/system/clarklab-tunnel.service
  systemctl daemon-reload
  systemctl enable clarklab-tunnel
  systemctl restart clarklab-tunnel
}

mkdir -p "$CONFIG_DIR"
migrate_legacy_cloudflared
install_cloudflared
ensure_login
ensure_tunnel

TUNNEL_UUID="$(resolve_tunnel_uuid)"
if [[ -z "$TUNNEL_UUID" ]]; then
  echo "Could not resolve tunnel UUID for ${TUNNEL_NAME}"
  exit 1
fi

CREDS="$CONFIG_DIR/${TUNNEL_UUID}.json"
ensure_credentials "$TUNNEL_UUID"
write_config "$TUNNEL_UUID" "$CREDS"
validate_config

cloudflared tunnel route dns "$TUNNEL_NAME" "$API_HOSTNAME" || true
cloudflared tunnel route dns "$TUNNEL_NAME" "$WILDCARD_HOSTNAME" || true

install_service

echo "Tunnel configured for https://${API_HOSTNAME} -> http://127.0.0.1:3000"
echo "Wildcard services: https://${WILDCARD_HOSTNAME} -> http://127.0.0.1:8080"
echo "Status: systemctl status clarklab-tunnel"
