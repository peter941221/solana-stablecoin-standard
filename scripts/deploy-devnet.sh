#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v anchor >/dev/null 2>&1; then
  echo "anchor CLI not found" >&2
  exit 1
fi

if ! command -v cargo-build-sbf >/dev/null 2>&1; then
  echo "cargo-build-sbf not found (install Solana CLI or cargo-build-sbf)" >&2
  exit 1
fi

export ANCHOR_PROVIDER_URL="${ANCHOR_PROVIDER_URL:-https://api.devnet.solana.com}"
export ANCHOR_WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

echo "==> Building programs"
anchor build

echo "==> Deploying programs to devnet"
anchor deploy --provider.cluster devnet

if command -v solana >/dev/null 2>&1; then
  CORE_ID="$(solana address -k "$ROOT_DIR/target/deploy/stablecoin_core-keypair.json")"
  HOOK_ID="$(solana address -k "$ROOT_DIR/target/deploy/transfer_hook-keypair.json")"
  echo "stablecoin-core: $CORE_ID"
  echo "transfer-hook:  $HOOK_ID"
else
  echo "solana CLI not found; use target/deploy/*-keypair.json to fetch program IDs"
fi

cat <<'EOF'

Next steps:
- export SSS_CORE_PROGRAM_ID=<stablecoin-core program id>
- export SSS_TRANSFER_HOOK_PROGRAM_ID=<transfer-hook program id>
- export AUTHORITY_KEYPAIR_PATH=~/.config/solana/id.json
- npx tsx scripts/demo-sss1.ts
- npx tsx scripts/demo-sss2.ts
EOF
