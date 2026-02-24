# Hackathon Deliverables

## Checklist

- [x] Source code repository with MIT license (LICENSE).
- [x] On-chain programs: programs/stablecoin-core, programs/transfer-hook.
- [x] SDK package: sdk/sss-token.
- [x] CLI tools: cli.
- [x] Services: services (mock + live mode).
- [x] Tests: tests/anchor, tests/sdk.
- [x] CI workflow: .github/workflows/ci.yml.
- [x] Documentation: docs/ARCHITECTURE.md, docs/SDK.md, docs/SSS-1.md, docs/SSS-2.md, docs/COMPLIANCE.md, docs/API.md, docs/CLI.md, docs/OPERATIONS.md, docs/DEPLOYMENT.md, docs/RUNBOOK.md.
- [x] Devnet deployment summary: deployments/devnet.json.
- [x] Devnet proofs: deployments/devnet-sss1-proof.json, deployments/devnet-sss2-proof.json.
- [x] Demo scripts: scripts/demo-sss1.ts, scripts/demo-sss2.ts.
- [x] Deploy scripts: scripts/deploy-devnet.sh, scripts/deploy-mainnet.sh.

## Devnet Program IDs

- stablecoin_core: 5T8qkjgJVWcUVza36JVFq3GCiKwAXhunKc8NY2nNbtiZ
- transfer_hook: 5gVGKwPB7qstEN5Kp8fJGCURGPGz2GQnYHQAtD1zKSLB

## Proof Highlights

- SSS-1 initialize: 2B1HUHGmFsuvB1sxNyyYZ98PnZMB3J2RFwx5oQgpsDo6v44spKMu4XyyD7DPeP5FGqa19Tp2EjUUD65vznVSSmzt
- SSS-2 initialize: 3VDckxT5dVGH3SFGcZ28NAyKyeJHZp14AjtC4AoQMqzJu6uPeyhiWXnskDrvukZEsj5f7aFUE7G49MdSCTsqTuLa

## Reproduce Proofs

SSS-1:

NODE_OPTIONS=--dns-result-order=ipv4first DISABLE_AIRDROP=1 \
SSS_CORE_PROGRAM_ID=5T8qkjgJVWcUVza36JVFq3GCiKwAXhunKc8NY2nNbtiZ \
SSS_TRANSFER_HOOK_PROGRAM_ID=5gVGKwPB7qstEN5Kp8fJGCURGPGz2GQnYHQAtD1zKSLB \
SOLANA_RPC_URL=https://api.devnet.solana.com SOLANA_COMMITMENT=confirmed \
AUTHORITY_KEYPAIR_PATH=/path/to/id.json \
PROOF_PATH=deployments/devnet-sss1-proof.json \
npx tsx scripts/demo-sss1.ts

SSS-2:

NODE_OPTIONS=--dns-result-order=ipv4first DISABLE_AIRDROP=1 \
SSS_CORE_PROGRAM_ID=5T8qkjgJVWcUVza36JVFq3GCiKwAXhunKc8NY2nNbtiZ \
SSS_TRANSFER_HOOK_PROGRAM_ID=5gVGKwPB7qstEN5Kp8fJGCURGPGz2GQnYHQAtD1zKSLB \
SOLANA_RPC_URL=https://api.devnet.solana.com SOLANA_COMMITMENT=confirmed \
AUTHORITY_KEYPAIR_PATH=/path/to/id.json \
PROOF_PATH=deployments/devnet-sss2-proof.json \
npx tsx scripts/demo-sss2.ts

## Notes

- SSS-2 blocked transfer is expected; see blockedTransferError in deployments/devnet-sss2-proof.json.
