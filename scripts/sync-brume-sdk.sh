#!/usr/bin/env bash
# Sync protocol SDK into the brume-app tree so EAS (git root = brume-app) can bundle it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${BRUME_PROTOCOL_SDK:-$ROOT/../brume-protocol/sdk}"
DST="$ROOT/packages/brume-sdk"

if [[ ! -d "$SRC/src" ]]; then
  echo "Missing protocol SDK at $SRC" >&2
  exit 1
fi

mkdir -p "$DST"
rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude '*.tsbuildinfo' \
  "$SRC/" "$DST/"

echo "Synced $SRC -> $DST"
