# Deployment

See docs/RUNBOOK.md for the full step-by-step runbook and rollback plan.

## Devnet Workflow (Script)

Prerequisites

- Solana CLI installed.

- Anchor CLI installed.

- Keypair with devnet SOL.

Steps

1. Run the devnet deploy script

   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
   ANCHOR_WALLET=~/.config/solana/id.json \
   bash scripts/deploy-devnet.sh

2. Record deployment IDs

   - deployments/devnet.json

3. Run demo scripts (Devnet proof)

   SSS_CORE_PROGRAM_ID=<stablecoin-core program id> \
   SSS_TRANSFER_HOOK_PROGRAM_ID=<transfer-hook program id> \
   AUTHORITY_KEYPAIR_PATH=~/.config/solana/id.json \
   npx tsx scripts/demo-sss1.ts

   SSS_CORE_PROGRAM_ID=<stablecoin-core program id> \
   SSS_TRANSFER_HOOK_PROGRAM_ID=<transfer-hook program id> \
   AUTHORITY_KEYPAIR_PATH=~/.config/solana/id.json \
   npx tsx scripts/demo-sss2.ts

4. Initialize a stablecoin (CLI or SDK)

   sss-token init --preset sss-2 --name "DREX" --symbol "DREX"

5. Record deployment proof

   - Program IDs

   - Initialize transaction signature

## Mainnet Workflow (Script)

Prerequisites

- Solana CLI installed.

- Anchor CLI installed.

- Upgrade authority keypair funded with mainnet SOL.

- Multi-sig or hardware wallet ready (recommended).

Steps

1. Run the mainnet deploy script (guarded)

   CONFIRM_MAINNET=1 ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com \
   ANCHOR_WALLET=~/.config/solana/id.json \
   bash scripts/deploy-mainnet.sh

2. Record deployment IDs

   - deployments/mainnet.json

3. Initialize a stablecoin and verify flows

   - Use the CLI or SDK for init/mint/freeze/blacklist/seize

## Devnet Checklist

Prerequisites

- Solana CLI installed.

- Anchor CLI installed.

- Keypair with devnet SOL.

Steps

1. Build programs

   anchor build

2. Deploy stablecoin-core

   anchor deploy --program-name stablecoin-core

3. Deploy transfer-hook

   anchor deploy --program-name transfer-hook

4. Run demo scripts (Devnet proof)

   SSS_CORE_PROGRAM_ID=<stablecoin-core program id> \
   SSS_TRANSFER_HOOK_PROGRAM_ID=<transfer-hook program id> \
   AUTHORITY_KEYPAIR_PATH=~/.config/solana/id.json \
   npx tsx scripts/demo-sss1.ts

   SSS_CORE_PROGRAM_ID=<stablecoin-core program id> \
   SSS_TRANSFER_HOOK_PROGRAM_ID=<transfer-hook program id> \
   AUTHORITY_KEYPAIR_PATH=~/.config/solana/id.json \
   npx tsx scripts/demo-sss2.ts

5. Initialize a stablecoin (CLI or SDK)

   sss-token init --preset sss-2 --name "DREX" --symbol "DREX"

6. Record deployment proof

   - Program IDs

   - Initialize transaction signature

## Deployment Proof Template

Fill in after devnet deployment.

- stablecoin-core program id: TBD

- transfer-hook program id: TBD

- mint address: TBD

- config PDA: TBD

- initialize tx: TBD

- sss1 mint tx: TBD

- sss1 transfer tx: TBD

- sss1 freeze tx: TBD

- sss1 thaw tx: TBD

- sss1 burn tx: TBD

- sss2 mint tx: TBD

- sss2 transfer tx: TBD

- sss2 blacklist tx: TBD

- sss2 blocked transfer tx: TBD

- sss2 freeze tx: TBD

- sss2 seize tx: TBD

- timestamp: TBD

## Docker Compose

SSS-1 profile

  docker compose up

SSS-2 profile

  docker compose --profile compliant up

Backend modes

- SERVICE_MODE=mock runs demo logic without chain access.

- SERVICE_MODE=live requires RPC + database + Redis.

- SERVICE_KIND selects mint-burn, indexer, or compliance.

Notes

- Docker Desktop (engine) must be running before docker compose.

- For live mode, set PROGRAM_ID, MINT_ADDRESS, AUTHORITY_KEYPAIR_PATH, SOLANA_RPC_URL, DATABASE_URL, REDIS_URL in .env.

- Compliance live mode also needs SCREENING_API_KEY; API_KEY is optional.
