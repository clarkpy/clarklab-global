#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  echo "This install requires bash. Download it first, then run the below with bash:" >&2
  echo "  curl -fsSL <install-url> -o /tmp/clarklab-install.sh" >&2
  echo "  sudo bash /tmp/clarklab-install.sh --token <token> --server <url>" >&2
  exit 1
fi
set -euo pipefail

TOKEN=""
SERVER=""
DATA_ROOT="/var/lib/clarklab/services"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/clarklab"
SERVICE_USER="clarklab"
SERVICE_NAME="clarklab-agent"
RUSTUP_HOME="/usr/local/rustup"
CARGO_HOME="/usr/local/cargo"
AGENT_RELEASE_REPOSITORY="${CLARKLAB_AGENT_RELEASE_REPOSITORY:-clarkpy/clarklab-global}"
AGENT_VERSION="${CLARKLAB_AGENT_VERSION:-latest}"
BUILD_FROM_SOURCE=false

resolve_script_dir() {
  local source="${BASH_SOURCE[0]:-$0}"
  if [[ -f "$source" ]]; then
    cd "$(dirname "$source")" && pwd
    return 0
  fi
  echo ""
}

SCRIPT_DIR="$(resolve_script_dir)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2 ;;
    --server) SERVER="$2"; shift 2 ;;
    --data-root) DATA_ROOT="$2"; shift 2 ;;
    --agent-version) AGENT_VERSION="$2"; shift 2 ;;
    --build-from-source) BUILD_FROM_SOURCE=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$TOKEN" || -z "$SERVER" ]]; then
  echo "Usage: install.sh --token <token> --server <url> [--data-root <path>] [--agent-version <version>] [--build-from-source]"
  exit 1
fi

resolve_helper_script() {
  local name="$1"
  if [[ -n "$SCRIPT_DIR" && -f "${SCRIPT_DIR}/${name}" ]]; then
    echo "${SCRIPT_DIR}/${name}"
    return 0
  fi

  local dest
  dest="$(mktemp "/tmp/clarklab-${name}.XXXXXX")"
  curl -fsSL "${SERVER%/}/agent/scripts/${name}" -o "$dest"
  chmod +x "$dest"
  echo "$dest"
}

release_asset_name() {
  local machine
  machine="$(uname -m)"

  case "$machine" in
    x86_64|amd64)
      echo "clarklab-agent-linux-amd64"
      ;;
    aarch64|arm64)
      echo "clarklab-agent-linux-arm64"
      ;;
    *)
      echo "Unsupported architecture: $machine"
      exit 1
      ;;
  esac
}

release_download_base() {
  if [[ "$AGENT_VERSION" == "latest" ]]; then
    echo "https://github.com/${AGENT_RELEASE_REPOSITORY}/releases/latest/download"
    return
  fi

  local tag="$AGENT_VERSION"
  if [[ "$tag" != agent-v* ]]; then
    tag="agent-v${tag}"
  fi

  echo "https://github.com/${AGENT_RELEASE_REPOSITORY}/releases/download/${tag}"
}

install_prebuilt_agent() {
  local download_dir="$1"
  local asset
  local base_url
  local expected_checksum
  local actual_checksum

  asset="$(release_asset_name)" || return 1
  base_url="$(release_download_base)"

  echo "Downloading prebuilt agent from ${base_url}/${asset}..."

  if ! curl -fL \
    "${base_url}/${asset}" \
    -o "${download_dir}/${asset}"; then
    echo "Failed to download prebuilt agent from ${base_url}/${asset}"
    return 1
  fi

  if ! curl -fL \
    "${base_url}/checksums.txt" \
    -o "${download_dir}/checksums.txt"; then
    echo "Failed to download checksums from ${base_url}/checksums.txt"
    return 1
  fi

  expected_checksum="$(
    awk -v asset="$asset" '
      $2 == asset {
        print $1
        exit
      }
    ' "${download_dir}/checksums.txt"
  )"

  if [[ ! "$expected_checksum" =~ ^[0-9a-fA-F]{64}$ ]]; then
    echo "The checksum file does not contain a valid checksum for ${asset}."
    return 2
  fi

  actual_checksum="$(
    sha256sum "${download_dir}/${asset}" | awk '{ print $1 }'
  )"

  if [[ "$actual_checksum" != "$expected_checksum" ]]; then
    echo "Agent checksum verification failed."
    echo "Expected: ${expected_checksum}"
    echo "Actual:   ${actual_checksum}"
    return 2
  fi

  install -m 755 "${download_dir}/${asset}" "$INSTALL_DIR/clarklab-agent"

  "${INSTALL_DIR}/clarklab-agent" --help >/dev/null

  echo "Clarklab agent installed successfully."
}

mkdir -p "$CONFIG_DIR"
mkdir -p "$INSTALL_DIR"

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/clarklab --shell /usr/sbin/nologin "$SERVICE_USER"
fi
usermod -aG docker "$SERVICE_USER" 2>/dev/null || true

if getent group systemd-journal >/dev/null 2>&1; then
  usermod -aG systemd-journal "$SERVICE_USER" 2>/dev/null || true
fi

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

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required so the agent can install updates and restart itself."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y sudo
  else
    echo "Install sudo, then re-run this script."
    exit 1
  fi
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

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

AGENT_INSTALLED=false

if [[ "$BUILD_FROM_SOURCE" == false ]]; then
  if install_prebuilt_agent "$TMPDIR"; then
    AGENT_INSTALLED=true
  else
    download_status=$?

    if [[ "$download_status" -eq 2 ]]; then
      echo "Refusing to continue after checksum verification failure."
      exit 1
    fi

    echo "Falling back to a local source build."
  fi
fi

if [[ "$AGENT_INSTALLED" == false ]]; then
  echo "Preparing Rust toolchain for source-build fallback..."
  RUST_HELPER="$(resolve_helper_script ensure-system-rust.sh)"
  SERVICE_USER="$SERVICE_USER" bash "$RUST_HELPER"
  echo "Building Clarklab agent from source..."

  AGENT_SRC=""

  if [[ -n "$SCRIPT_DIR" && -f "${SCRIPT_DIR}/../clarklab-agent/Cargo.toml" ]]; then
    AGENT_SRC="${SCRIPT_DIR}/../clarklab-agent"
  fi

  if [[ -n "$AGENT_SRC" ]]; then
    cp -R "${AGENT_SRC}/." "$TMPDIR/"
  else
    echo "Downloading agent source from ${SERVER}..."

    if ! curl -fsSL "${SERVER}/agent/source.tar.gz" |
      tar -xzf - -C "$TMPDIR"; then
      echo "Failed to download agent source archive from ${SERVER}/agent/source.tar.gz"
      exit 1
    fi
  fi

  if [[ ! -f "$TMPDIR/Cargo.toml" || ! -f "$TMPDIR/src/main.rs" ]]; then
    echo "Could not find agent source."
    exit 1
  fi

  (
    cd "$TMPDIR"
    env \
      CARGO_HOME="$CARGO_HOME" \
      RUSTUP_HOME="$RUSTUP_HOME" \
      cargo build --release --locked
  )

  install -m 755 \
    "$TMPDIR/target/release/clarklab-agent" \
    "$INSTALL_DIR/clarklab-agent"
fi

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
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=${INSTALL_DIR}/clarklab-agent run --config ${CONFIG_DIR}/agent.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

BINARY_HELPER="$(resolve_helper_script clarklab-install-agent-binary.sh)"
install -m 755 "$BINARY_HELPER" /usr/local/sbin/clarklab-install-agent-binary
SYSTEMCTL_BIN="$(command -v systemctl || echo /bin/systemctl)"
mkdir -p /etc/sudoers.d
cat > /etc/sudoers.d/clarklab-agent <<EOF
${SERVICE_USER} ALL=(root) NOPASSWD: /usr/local/sbin/clarklab-install-agent-binary
${SERVICE_USER} ALL=(root) NOPASSWD: ${SYSTEMCTL_BIN} restart ${SERVICE_NAME}
${SERVICE_USER} ALL=(root) NOPASSWD: ${SYSTEMCTL_BIN} restart --no-block ${SERVICE_NAME}
EOF
chmod 440 /etc/sudoers.d/clarklab-agent

echo "Clarklab agent installed and running."
