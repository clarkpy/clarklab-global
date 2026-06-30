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

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Installing cloudflared..."
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) CF_ARCH=amd64 ;;
    aarch64|arm64) CF_ARCH=arm64 ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
  esac
  TMP_DEB="$(mktemp --suffix=.deb)"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb" \
    -o "$TMP_DEB"
  dpkg -i "$TMP_DEB"
  rm -f "$TMP_DEB"
fi

mkdir -p "$CONFIG_DIR"

if [[ ! -f "$CONFIG_DIR/cert.pem" ]]; then
  echo "Log in to Cloudflare (opens browser or paste URL):"
  cloudflared tunnel login
fi

if ! cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_UUID="$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2 == n { print $1; exit }')"

if [[ -z "$TUNNEL_UUID" ]]; then
  echo "Could not resolve tunnel UUID for $TUNNEL_NAME"
  exit 1
fi

CREDS="$CONFIG_DIR/${TUNNEL_UUID}.json"
if [[ ! -f "$CREDS" ]]; then
  echo "Expected credentials at $CREDS"
  exit 1
fi

cat > "$CONFIG_DIR/config.yml" <<EOF
tunnel: ${TUNNEL_UUID}
credentials-file: ${CREDS}

ingress:
  - hostname: ${API_HOSTNAME}
    service: http://127.0.0.1:3000
  - hostname: ${WILDCARD_HOSTNAME}
    service: http://127.0.0.1:8080
  - service: http_status:404
EOF

cloudflared tunnel route dns "$TUNNEL_NAME" "$API_HOSTNAME" || true
cloudflared tunnel route dns "$TUNNEL_NAME" "$WILDCARD_HOSTNAME" || true

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
install -m 644 "$SCRIPT_DIR/../deploy/cloudflared/clarklab-tunnel.service" /etc/systemd/system/clarklab-tunnel.service
systemctl daemon-reload
systemctl enable clarklab-tunnel
systemctl restart clarklab-tunnel

echo "Tunnel configured for https://${API_HOSTNAME} -> http://127.0.0.1:3000"
echo "Wildcard services: https://${WILDCARD_HOSTNAME} -> http://127.0.0.1:8080"
echo "Status: systemctl status clarklab-tunnel"
