# Hackathon Submission Template

## Project Name

Solana Stablecoin Standard (SSS)

## One-Line Summary

Modular standard for issuing compliant stablecoins on Solana, with programs, SDK, CLI, and services.

## Links

- Repository: <REPO_URL>
- Demo proof (SSS-1): deployments/devnet-sss1-proof.json
- Demo proof (SSS-2): deployments/devnet-sss2-proof.json
- Deployment summary: deployments/devnet.json

## What It Does

- SSS-1: minimal stablecoin (mint/burn, freeze/thaw, metadata).
- SSS-2: compliant stablecoin (SSS-1 + transfer hook + blacklist + seize).

## Why It Matters

Provides a consistent, auditable standard for stablecoin issuance and compliance on Solana.

## Architecture

Programs:
- stablecoin-core
- transfer-hook

Client layer:
- SDK: sdk/sss-token
- CLI: cli

Services:
- mock + live mode (mint-burn, compliance, indexer)

## How To Verify (Devnet)

PowerShell:

pwsh scripts/verify-devnet.ps1

PowerShell dry run:

pwsh scripts/verify-devnet.ps1 -DryRun

PowerShell with proof tag:

pwsh scripts/verify-devnet.ps1 -ProofTag demo-2026-02-24

Bash:

bash scripts/verify-devnet.sh

Bash dry run:

bash scripts/verify-devnet.sh --dry-run

Bash with proof tag:

bash scripts/verify-devnet.sh --proof-tag demo-2026-02-24

Manual:

NODE_OPTIONS=--dns-result-order=ipv4first DISABLE_AIRDROP=1 \
SSS_CORE_PROGRAM_ID=5T8qkjgJVWcUVza36JVFq3GCiKwAXhunKc8NY2nNbtiZ \
SSS_TRANSFER_HOOK_PROGRAM_ID=5gVGKwPB7qstEN5Kp8fJGCURGPGz2GQnYHQAtD1zKSLB \
SOLANA_RPC_URL=https://api.devnet.solana.com SOLANA_COMMITMENT=confirmed \
AUTHORITY_KEYPAIR_PATH=/path/to/id.json \
PROOF_PATH=deployments/devnet-sss1-proof.json \
npx tsx scripts/demo-sss1.ts

NODE_OPTIONS=--dns-result-order=ipv4first DISABLE_AIRDROP=1 \
SSS_CORE_PROGRAM_ID=5T8qkjgJVWcUVza36JVFq3GCiKwAXhunKc8NY2nNbtiZ \
SSS_TRANSFER_HOOK_PROGRAM_ID=5gVGKwPB7qstEN5Kp8fJGCURGPGz2GQnYHQAtD1zKSLB \
SOLANA_RPC_URL=https://api.devnet.solana.com SOLANA_COMMITMENT=confirmed \
AUTHORITY_KEYPAIR_PATH=/path/to/id.json \
PROOF_PATH=deployments/devnet-sss2-proof.json \
npx tsx scripts/demo-sss2.ts

## Notes

- SSS-2 blocked transfer is expected and proves blacklist enforcement.
