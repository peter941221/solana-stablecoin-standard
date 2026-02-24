#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--dry-run] [--proof-tag TAG]"
}

DRY_RUN=0
PROOF_TAG="${PROOF_TAG:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --proof-tag)
      PROOF_TAG="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
devnet_config="$project_root/deployments/devnet.json"

if [[ ! -f "$devnet_config" ]]; then
  echo "Missing deployments/devnet.json at $devnet_config"
  exit 1
fi

read_config_value() {
  local key="$1"
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(data[process.argv[2]] ?? '');" "$devnet_config" "$key"
}

read_solana_config_keypair() {
  local config_path="$HOME/.config/solana/cli/config.yml"
  if [[ ! -f "$config_path" ]]; then
    echo ""
    return
  fi
  local line
  line=$(grep -m1 '^keypair_path:' "$config_path" || true)
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  echo "${line#keypair_path: }" | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//'
}

resolve_keypair_path() {
  local env_path="${AUTHORITY_KEYPAIR_PATH:-${SOLANA_KEYPAIR_PATH:-${SOLANA_WALLET:-}}}"
  local config_path
  config_path="$(read_solana_config_keypair)"
  local fallback_path="$HOME/.config/solana/id.json"
  local candidates=()
  if [[ -n "$env_path" ]]; then
    candidates+=("$env_path")
  fi
  if [[ -n "$config_path" ]]; then
    candidates+=("$config_path")
  fi
  candidates+=("$fallback_path")

  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done

  if [[ -f "/mnt/c/Users/$USER/.config/solana/id.json" ]]; then
    mkdir -p "$HOME/.config/solana"
    cp "/mnt/c/Users/$USER/.config/solana/id.json" "$fallback_path"
    echo "$fallback_path"
    return
  fi

  echo ""
}

keypair_path="$(resolve_keypair_path)"
if [[ -z "$keypair_path" ]]; then
  echo "Keypair not found. Set AUTHORITY_KEYPAIR_PATH or copy your keypair to $HOME/.config/solana/id.json"
  exit 1
fi

export SSS_CORE_PROGRAM_ID="$(read_config_value stablecoin_core_program_id)"
export SSS_TRANSFER_HOOK_PROGRAM_ID="$(read_config_value transfer_hook_program_id)"
export SOLANA_RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
export SOLANA_COMMITMENT="${SOLANA_COMMITMENT:-confirmed}"
export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"
export DISABLE_AIRDROP="1"
export AUTHORITY_KEYPAIR_PATH="$keypair_path"
if [[ -n "$PROOF_TAG" ]]; then
  export PROOF_TAG="$PROOF_TAG"
fi

echo "Using keypair: $keypair_path"
solana-keygen pubkey "$keypair_path"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run enabled. Skipping demo scripts."
  exit 0
fi

print_summary() {
  local sss1_proof="$project_root/deployments/devnet-sss1-proof.json"
  local sss2_proof="$project_root/deployments/devnet-sss2-proof.json"
  if [[ -f "$sss1_proof" ]]; then
    local sss1_init
    sss1_init=$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(data.signatures?.initialize ?? '');" "$sss1_proof")
    echo "SSS-1 initialize: $sss1_init"
  fi
  if [[ -f "$sss2_proof" ]]; then
    local sss2_init
    sss2_init=$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(data.signatures?.initialize ?? '');" "$sss2_proof")
    echo "SSS-2 initialize: $sss2_init"
  fi
}

export PROOF_PATH="$project_root/deployments/devnet-sss1-proof.json"
npx tsx "$project_root/scripts/demo-sss1.ts"

export PROOF_PATH="$project_root/deployments/devnet-sss2-proof.json"
npx tsx "$project_root/scripts/demo-sss2.ts"

echo "Proofs refreshed (new signatures are expected on each run)."
print_summary
