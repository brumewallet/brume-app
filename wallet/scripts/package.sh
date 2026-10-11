#!/usr/bin/env bash
# Builds the extension and zips it for a GitHub release:
#   release/brume-wallet-v<version>.zip  ->  brume-wallet/manifest.json, ...
# Testers unzip it and pick the brume-wallet folder in "Load unpacked".
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
if [ -z "${VITE_POSTHOG_KEY:-}" ] && ! grep -qs '^VITE_POSTHOG_KEY=.\+' .env .env.production 2>/dev/null; then
  echo "warning: VITE_POSTHOG_KEY is not set, so this build has analytics off" >&2
fi

pnpm build

rm -rf release/brume-wallet
mkdir -p release
cp -R dist release/brume-wallet
out="release/brume-wallet-v${version}.zip"
rm -f "$out"
(cd release && zip -qr "../$out" brume-wallet -x '*.DS_Store' '.vite/*' 'brume-wallet/.vite/*')
rm -rf release/brume-wallet
echo "$out"
