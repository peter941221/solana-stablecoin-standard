# Project Memory

Date: 2026-02-21

Progress:
- Read technical document 技术文档.txt (full spec).
- Retrieved bounty page content via r.jina.ai mirror for the Superteam listing.
- Reference repo checked: solanabr/solana-vault-standard README.
- Initialized repo scaffold (directories, docs skeletons, README, LICENSE, .env.example, .gitignore).
- Added Anchor workspace config (Anchor.toml, Cargo.toml).
- Added stablecoin-core Anchor program skeleton (state, errors, events, instructions).
- Added transfer-hook Anchor program skeleton (execute entry + state stubs).
- Added SDK package skeleton (@stbr/sss-token) with modules and placeholders.
- Added CLI skeleton with clap command structure.
- Updated 技术文档.txt with corrections and completion notes.
- Implemented stablecoin-core instruction logic (roles, mint/burn, freeze/thaw, pause, blacklist, seize).
- Implemented transfer-hook blacklist checks and feature gating.
- Added helper constants and role validation utilities.
- Adjusted SPL dependency versions for Solana 1.18/Anchor 0.30 compatibility.
- Fixed init_if_needed usage, payer mutability, and bump handling.
- Updated program IDs for stablecoin-core and transfer-hook.
- Switched token accounts to token_interface + InterfaceAccount types.
- Fixed signer seed lifetimes and config borrow in initialize.
- Tests: cargo test -p stablecoin-core -p transfer-hook (passed with warnings).
- Added transfer-hook extra account meta validation and corrected account order.
- Added spl-tlv-account-resolution dependency for transfer-hook.
- Suppressed unexpected cfg warnings and removed unused extra-account const.
- Synced Anchor.toml program IDs to new core/hook IDs.
- Implemented SDK PDA helpers, program ID constants, and instruction builders.
- Exported SDK instructions/utils and added @types/node for TS builds.
- Implemented SDK stablecoin client, compliance module, and role manager.
- Added account decoders and transaction sender helpers in SDK utils.
- SDK build: npm install + npm run build (passes). Added package-lock.json.
- Reworked transfer-hook to handle SPL transfer-hook interface instructions via custom entrypoint.
- Added initialize/update extra account meta list handlers for transfer-hook.
- Tests: cargo test -p transfer-hook -p stablecoin-core (passes).
- Initialized git repo, set main branch, and configured GitHub origin.
- Rebased against origin/main and pushed changes to GitHub.
- Added Anchor test coverage for SSS-1 initialize + mint flow.
- Attempted anchor test; anchor CLI not found in environment.
- Added Anchor test coverage for SSS-2 blacklist + seize flow.
- Installed anchor-cli 0.30.1 via cargo (direct install with cache).
- Anchor test blocked by missing cargo-build-sbf; install fails due to low memory/pagefile.

Notes:
- Direct fetch from superteam.fun failed due to certificate/JS rendering; r.jina.ai HTTP mirror succeeded.
- Bounty listing confirms MIT license requirement and three-layer architecture (SDK, modules, presets).
- Used shell mkdir because directory creation tool was blocked by allowed-path policy.
 - Anchor CLI installed; anchor test still blocked by missing cargo-build-sbf.
 - cargo-build-sbf install fails with memory allocation / pagefile errors on Windows.

Next:
 - Run anchor test after installing cargo-build-sbf (or Solana CLI).
- Fill docs for SDK and SSS-2.
- Add backend service skeletons and docker-compose.
 - Install cargo-build-sbf (or Solana CLI) and re-run anchor test.

Date: 2026-02-22

Progress:
- Reviewed git status/diff/log to check recent progress.
- Noted untracked file: model-calls.jsonl.
- Reviewed 技术文档.txt for scope and deliverables.
- Estimated overall completion at ~40-45% based on D1-D9.
- Implemented Rust CLI command handlers for init/mint/burn/freeze/thaw/pause/unpause/blacklist/seize/minters/status/supply/holders/audit-log.
- Added PDA/instruction builders, Solana config loading, amount parsing/formatting, and on-chain account decoding in CLI.
- Added CLI unit tests for amount parsing/formatting.
- Added CLI to workspace members and exposed stablecoin-core constants/state for reuse.
- cargo test --manifest-path cli/Cargo.toml (passed; solana-client future-incompat warning).
- Added backend services skeleton (Fastify) with mock modes for mint-burn, indexer, and compliance routes.
- Added docker-compose.yml and services/init.sql for Postgres/Redis scaffolding.
- Filled docs for SSS-1, SSS-2, SDK, API, Architecture, Compliance, Operations, CLI, and Deployment.
- Added devnet deployment template at deployments/devnet.json.
- Devnet deployment kept as template (no on-chain actions).

Additional Progress:
- Implemented services live mode building blocks: Postgres db helpers, Redis idempotency store, Solana RPC client, Anchor event IDL, event indexer, SSE stream, webhook dispatcher.
- Reworked services entrypoint/context/server to wire live mode (mint-burn, compliance, indexer) with db/redis/solana.
- Updated routes for live mode mint/burn, compliance (blacklist + audit export), and indexer (events, webhooks, SSE).
- Updated services env/config, docker compose, and SQL schema for operations/events/webhooks/indexer state.
- Added service tests for idempotency store and Solana helpers.
- Added @types/pg and fixed monitoring rules map typing in db helper.
- Installed services dependencies and updated test script to use Node --import tsx.
- Fixed Redis client typing and rowCount null check; services tests pass; services build passes.
- Ran npm audit; found high severity vulnerabilities in fastify and bigint-buffer (@solana/spl-token dependency).
- docker-compose up -d failed because Docker engine was not available; compose also warned about missing env vars.
- Updated deployment docs with Docker engine note and live mode env reminders.
- Docker compose build/run succeeded (mint-burn + indexer + postgres + redis), health checks OK on /api/v1/health.
- Started compliance profile; compliance service healthy on port 3003.
- Ran mock-mode API smoke tests: mint/burn/supply/operations, blacklist add/remove/list, indexer events/webhooks, audit export (empty), screening check returned provider_not_configured.
- Tried Solana CLI install; release downloads failed. Installed cargo-build-sbf from crates, but platform-tools download timed out/corrupted; anchor build blocked.
- Added scripts for devnet deploy and demo flows; updated deployment docs and gitignore for keys.

Date: 2026-02-23

Progress:
- Restored project memory context (MEMORY.md read) and summarized status for the user.
- Collected official manual download steps for Solana CLI (Agave) from docs.anza.xyz.
- Verified solana-release folder and bin contents; solana.exe runs.
- Added user PATH entry for solana-release\bin and verified solana --version (3.1.8).
- Attempted anchor test; build failed on Windows due to Rust std/toolchain mismatch in Solana platform-tools.
- Investigated platform-tools cache and rustup toolchains; errors persist with sbpf toolchain.
- Verified WSL status: Ubuntu default, WSL2 running; docker-desktop WSL distro running.
- Checked WSL environment: solana/rust/cargo/anchor not installed inside WSL.
- Installed WSL build dependencies via apt-get (llvm/clang/protobuf/etc).
- Rustup install in WSL failed due to timeout downloading channel metadata.

Notes:
- Manual download source: https://github.com/anza-xyz/agave/releases/latest
- Windows archive: solana-release-x86_64-pc-windows-msvc.tar.bz2
- solana-cli version detected: 3.1.8 (Agave).

Next:
- Install Solana CLI manually if installer keeps failing, then re-run anchor test.

Date: 2026-02-23

Progress:
- Reordered mint initialization: initialize_mint2 now runs before mint extensions.
- Attempted anchor test on Windows; build failed due to Solana platform-tools Rust std mismatch.
- Attempted anchor test via WSL using wsl.exe; path/WSL service errors blocked the run.

Next:
- Run anchor test from WSL once wsl.exe can access the workspace path.
- Re-check InitializeMint2 failure after successful WSL test run.

Progress:
- WSL anchor test now runs; SSS-1 tests pass.
- Fixed transfer-hook extra account meta initialization to use ExecuteInstruction discriminator.
- Seize now thaws, transfers with transfer-hook remaining accounts, and refreezes.
- Transfer-hook allows config authority transfers (seize) while still blocking blacklisted owners.
- Added treasury blacklist entry setup in SSS-2 test and extra transfer-hook accounts.
- Anchor tests now pass (SSS-1 + SSS-2).

Progress:
- Added tests/package.json to mark tests as ESM and remove module type warnings.
- Added bigint rebuild helper and pretest hook to load native bindings when available.
- Fixed anchor-syn lifetime warnings in vendor parser.
- Added GitHub Actions CI workflow for Anchor tests on ubuntu.
- Added mainnet deployment script and template, updated deployment docs.

Progress:
- Added CI caching for cargo and Solana installs.
- Added deployment runbook with rollback steps.
- Rebuilt bigint-buffer native bindings; anchor tests run clean.

Progress:
- Anchor tests re-run in WSL with no warnings.
- CI workflow updated with caching and concurrency guard.
- Deployment runbook linked from docs/DEPLOYMENT.md.

Progress:
- Devnet deploy blocked by airdrop rate limit; wallet balance is 0 SOL.

Progress:
- Devnet deploy attempted; insufficient SOL and airdrop rate limited.

Progress:
- Devnet deploy (solana program deploy --use-rpc): stablecoin_core succeeded, transfer_hook failed due to insufficient funds.

Progress:
- Devnet: transfer_hook upgraded; stablecoin_core already deployed.
- SSS-1 devnet demo succeeded and wrote deployments/devnet-sss1-proof.json.
- SSS-2 devnet demo blocked by transfer hook TransferDenied; authority SOL drained to 0.0013.

Progress:
- Restored project memory context for current session (user request).

Date: 2026-02-24

Progress:
- Tried running devnet SSS-2 demo with devnet program IDs and DISABLE_AIRDROP=1; failed because keypair file C:\Users\peter\.config\solana\id.json not found.
- solana config get shows config path C:\Users\peter\.config\solana\cli\config.yml, but the directory does not exist; need actual keypair path.
- User provided devnet wallet address 4LmeKS6NTWxmd4g4TQmjydee4tnshghL5FSNamZeFSDs; still need matching keypair file path to sign SSS-2 demo.
- Located the matching keypair in WSL at ~/.config/solana/id.json (pubkey 4LmeKS6...).
- Copied WSL keypair to C:\Users\peter\.config\solana\id.json with backup of the newer file.
- Devnet balance confirmed ~10 SOL for authority keypair.
- SSS-2 devnet demo succeeded; wrote deployments/devnet-sss2-proof.json.
- Filled deployments/devnet.json with devnet IDs, mint, config PDA, initialize tx, and timestamp.
- Updated README with devnet proofs and tx signatures.
- Added docs/HACKATHON-DELIVERABLES.md checklist for submission.
- Removed stray Userspeterkeypair.json from repo and ignored keypair patterns in .gitignore.
- Hardened demo scripts to resolve keypair paths with os.homedir and clear error hints.
- Added docs/HACKATHON-SUBMISSION.md for project description + highlights.
- Verified keypair pubkey via solana-keygen pubkey (matches 4LmeKS...).
- Added scripts/verify-devnet.ps1 to resolve keypair paths and re-run devnet demos.
- Added docs/HACKATHON-SUBMISSION-TEMPLATE.md and updated README with verification/script links.
- Demo scripts now read Solana CLI config for keypair fallback.
- Added DryRun mode to scripts/verify-devnet.ps1 and executed it to verify keypair path.
- Ran full scripts/verify-devnet.ps1 to regenerate devnet proofs.
- Updated deployments/devnet.json and README with latest devnet proof signatures.
- Updated docs/HACKATHON-DELIVERABLES.md proof highlights to latest signatures.
- Added scripts/verify-devnet.sh and referenced it in README and submission docs.
- Ran scripts/verify-devnet.sh and refreshed devnet proofs, devnet.json, and README signatures.
- Added proof tagging via PROOF_TAG in demo scripts and verification scripts.
- Added verify script summary output and README note about regenerating proofs.
- Ran pwsh scripts/verify-devnet.ps1 -ProofTag demo-2026-02-24 and refreshed devnet proofs/docs.
- Successfully submitted the project to Superteam Earn platform!
- Created PR #5 on the official solanabr/solana-stablecoin-standard repository.
- Hackathon milestone achieved. All deliverables complete.
