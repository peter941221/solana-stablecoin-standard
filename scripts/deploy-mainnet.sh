#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${CONFIRM_MAINNET:-}" != "1" ]]; then
  echo "Set CONFIRM_MAINNET=1 to deploy to mainnet." >&2
  exit 1
fi

if ! command -v anchor >/dev/null 2>&1; then
  echo "anchor CLI not found" >&2
  exit 1
fi

if ! command -v cargo-build-sbf >/dev/null 2>&1; then
  echo "cargo-build-sbf not found (install Solana CLI or cargo-build-sbf)" >&2
  exit 1
fi

export ANCHOR_PROVIDER_URL="${ANCHOR_PROVIDER_URL:-https://api.mainnet-beta.solana.com}"
export ANCHOR_WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

echo "==> Building programs"
anchor build

echo "==> Deploying programs to mainnet"
anchor deploy --provider.cluster mainnet

if command -v solana >/dev/null 2>&1; then
  CORE_ID="$(solana address -k "$ROOT_DIR/target/deploy/stablecoin_core-keypair.json")"
  HOOK_ID="$(solana address -k "$ROOT_DIR/target/deploy/transfer_hook-keypair.json")"
  echo "stablecoin-core: $CORE_ID"
  echo "transfer-hook:  $HOOK_ID"
else
  echo "solana CLI not found; use target/deploy/*-keypair.json to fetch program IDs"
fi
