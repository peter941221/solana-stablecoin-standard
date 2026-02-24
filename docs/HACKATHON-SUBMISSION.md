# Hackathon Submission

## Project Description

Solana Stablecoin Standard (SSS) is a modular standard for issuing stablecoins on Solana.
It provides on-chain programs, a TypeScript SDK, a CLI, and service templates for
compliance-aware stablecoins.

## Highlights

- Two presets:
  - SSS-1: minimal stablecoin (mint/burn, freeze/thaw, metadata).
  - SSS-2: compliant stablecoin (SSS-1 + transfer hook + blacklist + seize).

- Full stack deliverables:
  - Programs: stablecoin-core + transfer-hook.
  - SDK: @stbr/sss-token instruction builders + helpers.
  - CLI: operations for mint/burn/freeze/thaw/blacklist/seize.
  - Services: mock + live mode (mint-burn, compliance, indexer).

- Devnet proofs:
  - SSS-1: deployments/devnet-sss1-proof.json
  - SSS-2: deployments/devnet-sss2-proof.json
  - Deployment summary: deployments/devnet.json

## Architecture (Layered)

┌──────────────────────────────────────┐
│  Applications / Integrations         │
├──────────────────────────────────────┤
│  SDK + CLI + Services (APIs)          │
├──────────────────────────────────────┤
│  Programs: stablecoin-core + hook     │
└──────────────────────────────────────┘

## How To Verify (Devnet)

SSS-1 demo:

NODE_OPTIONS=--dns-result-order=ipv4first DISABLE_AIRDROP=1 \
SSS_CORE_PROGRAM_ID=5T8qkjgJVWcUVza36JVFq3GCiKwAXhunKc8NY2nNbtiZ \
SSS_TRANSFER_HOOK_PROGRAM_ID=5gVGKwPB7qstEN5Kp8fJGCURGPGz2GQnYHQAtD1zKSLB \
SOLANA_RPC_URL=https://api.devnet.solana.com SOLANA_COMMITMENT=confirmed \
AUTHORITY_KEYPAIR_PATH=/path/to/id.json \
PROOF_PATH=deployments/devnet-sss1-proof.json \
npx tsx scripts/demo-sss1.ts

SSS-2 demo:

NODE_OPTIONS=--dns-result-order=ipv4first DISABLE_AIRDROP=1 \
SSS_CORE_PROGRAM_ID=5T8qkjgJVWcUVza36JVFq3GCiKwAXhunKc8NY2nNbtiZ \
SSS_TRANSFER_HOOK_PROGRAM_ID=5gVGKwPB7qstEN5Kp8fJGCURGPGz2GQnYHQAtD1zKSLB \
SOLANA_RPC_URL=https://api.devnet.solana.com SOLANA_COMMITMENT=confirmed \
AUTHORITY_KEYPAIR_PATH=/path/to/id.json \
PROOF_PATH=deployments/devnet-sss2-proof.json \
npx tsx scripts/demo-sss2.ts

## Notes

- SSS-2 blocked transfer is expected and proves blacklist enforcement.
