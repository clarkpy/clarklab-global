#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR="${1:?Usage: clarklab-install-agent-binary <build-dir>}"
BINARY="${BUILD_DIR}/target/release/clarklab-agent"

if [[ ! -f "$BINARY" ]]; then
  echo "Missing agent binary at ${BINARY}"
  exit 1
fi

install -m 755 "$BINARY" /usr/local/bin/clarklab-agent
