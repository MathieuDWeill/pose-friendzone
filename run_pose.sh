#!/usr/bin/env bash
set -euo pipefail

printf '\nPOSE — first run\n'
printf '================\n'

if ! command -v node >/dev/null 2>&1; then
  echo 'ERROR: Node.js is not installed. Install Node 20+ first.' >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node $(node -v) detected. POSE expects Node 20+." >&2
  exit 1
fi

echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

if [ ! -d node_modules ]; then
  echo '\n[1/4] Installing Decentraland SDK dependencies...'
  npm install
else
  echo '\n[1/4] node_modules already present.'
fi

echo '\n[2/4] Running offline project verification...'
npm run verify

echo '\n[3/4] Building the Decentraland scene...'
npm run build

echo '\n[4/4] Starting preview...'
echo 'Tip: open a second client/instance to test the real cooperative mode.'
npm run start
