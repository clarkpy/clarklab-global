#!/usr/bin/env bash
set -euo pipefail

RUSTUP_HOME="/usr/local/rustup"
CARGO_HOME="/usr/local/cargo"
SERVICE_USER="${SERVICE_USER:-clarklab}"
export RUSTUP_HOME CARGO_HOME
export PATH="${CARGO_HOME}/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

ensure_build_tools() {
  if command -v cc >/dev/null 2>&1; then
    return 0
  fi

  echo "Installing C compiler and build tools (required for Rust builds)..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y build-essential pkg-config libssl-dev
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y gcc gcc-c++ make openssl-devel pkgconfig
  else
    echo "Install a C toolchain (build-essential on Debian) then re-run install.sh."
    exit 1
  fi
}

link_binaries() {
  mkdir -p /usr/local/bin
  if [[ -x "${CARGO_HOME}/bin/cargo" ]]; then
    ln -sf "${CARGO_HOME}/bin/cargo" /usr/local/bin/cargo
  fi
  if [[ -x "${CARGO_HOME}/bin/rustc" ]]; then
    ln -sf "${CARGO_HOME}/bin/rustc" /usr/local/bin/rustc
  fi
  if [[ -x "${CARGO_HOME}/bin/rustup" ]]; then
    ln -sf "${CARGO_HOME}/bin/rustup" /usr/local/bin/rustup
  fi
}

toolchain_ready() {
  cargo --version >/dev/null 2>&1
}

ensure_build_tools

if [[ ! -x "${CARGO_HOME}/bin/rustup" ]]; then
  echo "Installing Rust toolchain for the Clarklab agent (system-wide)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    env RUSTUP_HOME="$RUSTUP_HOME" CARGO_HOME="$CARGO_HOME" RUSTUP_INIT_SKIP_PATH_CHECK=yes \
    sh -s -- -y --no-modify-path --default-toolchain stable
fi

link_binaries

if ! toolchain_ready; then
  echo "Configuring default Rust toolchain (stable)..."
  rustup default stable
fi

if ! toolchain_ready; then
  echo "Rust toolchain setup failed. Try: env RUSTUP_HOME=${RUSTUP_HOME} CARGO_HOME=${CARGO_HOME} rustup default stable"
  exit 1
fi

if id "$SERVICE_USER" >/dev/null 2>&1; then
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$RUSTUP_HOME" "$CARGO_HOME"
  echo "Rust directories are owned by ${SERVICE_USER} for in-place agent builds."
else
  echo "User ${SERVICE_USER} not found; agent builds may fail with permission errors."
fi

echo "Rust ready: $(cargo --version)"
echo ""
echo "Ensure /etc/systemd/system/clarklab-agent.service includes:"
echo "  Environment=PATH=/usr/local/bin:/usr/bin:/bin"
echo "  Environment=CARGO_HOME=${CARGO_HOME}"
echo "  Environment=RUSTUP_HOME=${RUSTUP_HOME}"
echo ""
echo "Then: systemctl daemon-reload && systemctl restart clarklab-agent"
