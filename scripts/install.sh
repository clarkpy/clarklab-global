#!/usr/bin/env bash
set -euo pipefail

TOKEN=""
SERVER=""
DATA_ROOT="/var/lib/clarklab/services"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/clarklab"
SERVICE_USER="clarklab"
SERVICE_NAME="clarklab-agent"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2 ;;
    --server) SERVER="$2"; shift 2 ;;
    --data-root) DATA_ROOT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$TOKEN" || -z "$SERVER" ]]; then
  echo "Usage: install.sh --token <token> --server <url> [--data-root <path>]"
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) TARGET="x86_64-unknown-linux-gnu" ;;
  aarch64|arm64) TARGET="aarch64-unknown-linux-gnu" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

mkdir -p "$CONFIG_DIR"
mkdir -p "$INSTALL_DIR"

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/clarklab --shell /usr/sbin/nologin "$SERVICE_USER"
fi
usermod -aG docker "$SERVICE_USER" 2>/dev/null || true

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required on the node. Install Docker Engine then re-run this script."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required on the node for GitHub repository deploys. Install git then re-run this script."
  exit 1
fi

if ! command -v nixpacks >/dev/null 2>&1; then
  echo "Installing nixpacks for Git repository builds..."
  curl -fsSL https://nixpacks.com/install.sh | bash -s -- -y
fi

if ! command -v nixpacks >/dev/null 2>&1; then
  echo "nixpacks is required for GitHub repository deploys. Install failed; try manually: curl -sSL https://nixpacks.com/install.sh | bash -s -- -y"
  exit 1
fi

DATA_ROOT="${DATA_ROOT%/}"
mkdir -p "$DATA_ROOT"
chmod 755 "$DATA_ROOT"
if [[ -n "${SUDO_USER:-}" ]]; then
  chown -R "$SUDO_USER":"$(id -gn "$SUDO_USER")" "$(dirname "$DATA_ROOT")"
  echo "Created data directory at $DATA_ROOT (owned by $SUDO_USER)"
else
  echo "Created data directory at $DATA_ROOT"
fi

echo "Building Clarklab agent from source (requires Rust toolchain)..."
if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust/cargo not found. Install from https://rustup.rs then re-run this script."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_SRC="${SCRIPT_DIR}/../clarklab-agent"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

if [[ -f "${AGENT_SRC}/Cargo.toml" ]]; then
  cp -R "${AGENT_SRC}/." "$TMPDIR/"
else
  echo "Downloading agent source from ${SERVER}..."
  if ! curl -fsSL "${SERVER}/agent/source.tar.gz" | tar -xzf - -C "$TMPDIR"; then
    echo "Failed to download agent source archive from ${SERVER}/agent/source.tar.gz"
    exit 1
  fi
fi

if [[ ! -f "$TMPDIR/Cargo.toml" || ! -f "$TMPDIR/src/main.rs" ]]; then
  echo "Could not find agent source. Clone the monorepo or copy clarklab-agent to the host."
  exit 1
fi

(cd "$TMPDIR" && cargo build --release)
install -m 755 "$TMPDIR/target/release/clarklab-agent" "$INSTALL_DIR/clarklab-agent"

"$INSTALL_DIR/clarklab-agent" register \
  --token "$TOKEN" \
  --server "$SERVER" \
  --config "$CONFIG_DIR/agent.yaml" \
  --data-root "$DATA_ROOT"

chmod 700 "$CONFIG_DIR"
chmod 600 "$CONFIG_DIR/agent.yaml"
chown -R "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR"
mkdir -p "$DATA_ROOT"
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_ROOT"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Clarklab Node Agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
ExecStart=${INSTALL_DIR}/clarklab-agent run --config ${CONFIG_DIR}/agent.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "Clarklab agent installed and running."
