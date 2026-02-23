# Deployment Runbook

## Scope

- Deploy stablecoin-core and transfer-hook.

- Record deployment metadata.

- Verify critical flows.

## Preflight Checklist

1. Confirm clean working tree.

2. Confirm Solana CLI + Anchor CLI versions.

3. Confirm upgrade authority keypair and balance.

4. Confirm target cluster RPC URL.

5. Confirm release tag or commit hash to deploy.

## Devnet Runbook

1. Deploy programs

   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
   ANCHOR_WALLET=~/.config/solana/id.json \
   bash scripts/deploy-devnet.sh

2. Record IDs

   Update deployments/devnet.json with program IDs, mint, config PDA, and txs.

3. Verify core flows

   SSS_CORE_PROGRAM_ID=<stablecoin-core program id> \
   SSS_TRANSFER_HOOK_PROGRAM_ID=<transfer-hook program id> \
   AUTHORITY_KEYPAIR_PATH=~/.config/solana/id.json \
   npx tsx scripts/demo-sss1.ts

   SSS_CORE_PROGRAM_ID=<stablecoin-core program id> \
   SSS_TRANSFER_HOOK_PROGRAM_ID=<transfer-hook program id> \
   AUTHORITY_KEYPAIR_PATH=~/.config/solana/id.json \
   npx tsx scripts/demo-sss2.ts

4. Update client configs

   - Anchor.toml program IDs (if used for devnet).

   - SDK constants if the program IDs changed.

## Mainnet Runbook

1. Confirm approvals and release tag

2. Deploy programs

   CONFIRM_MAINNET=1 ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com \
   ANCHOR_WALLET=~/.config/solana/id.json \
   bash scripts/deploy-mainnet.sh

3. Record IDs

   Update deployments/mainnet.json with program IDs, mint, config PDA, and txs.

4. Verify minimal flows

   - Fetch program accounts to confirm ownership and upgrade authority.

   - Run a small mint to a treasury-controlled ATA.

   - Verify transfer hook rejects blacklisted transfers.

5. Update client configs

   - Anchor.toml and SDK program IDs.

   - Service environment variables for RPC + program IDs.

## Rollback Plan

Option A: Upgrade rollback (same program id)

1. Checkout the previous release tag.

2. Build programs: anchor build.

3. Deploy old binaries with the existing program ids:

   anchor deploy --program-name stablecoin-core

   anchor deploy --program-name transfer-hook

4. Re-run minimal verification steps.

Option B: New program id (only if upgrade authority lost)

1. Generate new program keypairs and deploy.

2. Update Anchor.toml, SDK constants, and service env vars.

3. Re-initialize config and mint on the new program id.

## Post-Deploy Checklist

- Update deployments/*.json with program ids and txs.

- Tag the release and archive binaries.

- Notify downstream services of program id changes.
