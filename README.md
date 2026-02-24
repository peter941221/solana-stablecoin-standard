# Solana Stablecoin Standard (SSS)

Open-source standards for stablecoins on Solana.

This repo delivers a modular SDK with opinionated presets:

- SSS-1 (Minimal Stablecoin)
- SSS-2 (Compliant Stablecoin)

## Quick Start

1. Build programs (coming soon).

2. Run tests (coming soon).

3. Try the CLI (coming soon).

## Presets

- SSS-1: Mint authority + freeze authority + metadata.

- SSS-2: SSS-1 + permanent delegate + transfer hook + blacklist enforcement.

## Devnet Proofs

- Devnet deployment summary: deployments/devnet.json

- SSS-1 proof: deployments/devnet-sss1-proof.json
  - initialize: 4puS9TrAM2YgHUkxsap4ioqFyRhEyHTJMVPNP6ghLYAzk6tDvA5ToSV8URsHDtMPGoGguGzkw2yGyfnZ6ukUNRiD
  - mint: WyitAnSyjPYQ6UKoXLFG2e5QaDAzWjBQVuTQT4heUHCnSxqAETsf7oHFGNCEqTj17vsC6ABJzLGWXzy9aKZLMHT
  - transfer: 5LxXTYNWEtPJZBWqkkWtqJNU8FRXAdtmFa7wWBHk6uBs2Bcrb6QkCZiGbWmSVCiQb9L2tpvAXRKXD1dxdqA1QiTi
  - freeze: 5Cg6WNo2R8RaSnRHRE3EmAjPjawVdwUp3hXzuw3mHUWSHnyTKjEaut9Cf8f27vCVEvfeAKTmZYrxfERVgsZBT9Pu
  - thaw: 5HwipFVRDnTq8jsBrajYWdwjSGCaeQcCCi4yNvVCW5CmTLUbVY8hdeCPJG7n7GvxZETt48TYCczFJY1aCbVUxTMF
  - burn: 7ghrxSrEswfd9QCX2Hj71rF78FoXhY3jXHQix7WVEppPAiQjsibt6HTaBngMUKx3rzcde2yniewgz1UAwtde2TT

- SSS-2 proof: deployments/devnet-sss2-proof.json
  - initialize: 6Cwb2G3nokoa3bAeUteJ8XYt4npFcmpD8FWGkavwWiqu28KpNeZtGpw2bj6bR48wKDd4u6p6cyELTsihdmdmHms
  - mint: 3gWwVwNuFW2WxEiLeHufNYhjV1mFDieu7QM6p7YEHbGSzvbX7MmAt3E3gzCFigLByhmDZy8KtAmwanH7EcEVhvn2
  - transfer: 5wjQNDjpMwD4AanWnsrqX4MzBfsZo6EuXfZfx23Ek3ugb4bVeZ5rCXb3JmmFCJGb5MQ3SQJJjLAFQMS6kFMaqkNp
  - blacklist: 536betMwpuS4SuundCm5jR7BScY11z6zrbUVyP4shVNfDw5dv155aZMHwvVGsoQNiz2ztXRLk6sJywEDdn956nQv
  - blocked transfer: expected (see blockedTransferError)
  - freeze: 5Yo4t2vvateyiMok4P6rwoUTL5rNEJX9DDG4Mohr5EM3XsGQFAvszQhscS9EPv4gkGVa4APp3mGdLxSFr8j22P6U
  - seize: 5gX3oYqHxUrPdtM4uoGpg5zaMh5FZFNA7rAdQhrHPozE77oruPNBJNABC7c6d9QfSpJEjtHP7CJux8kenq3f1HjY

## Verification

- PowerShell: scripts/verify-devnet.ps1

- PowerShell dry run: pwsh scripts/verify-devnet.ps1 -DryRun

- Bash: bash scripts/verify-devnet.sh

- Bash dry run: bash scripts/verify-devnet.sh --dry-run

Note: verification scripts generate new devnet proofs on each run.

## Repo Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── stablecoin-core/
│   └── transfer-hook/
├── sdk/
│   └── sss-token/
├── cli/
├── services/
│   ├── Dockerfile
│   ├── init.sql
│   └── src/
├── tests/
│   ├── anchor/
│   └── sdk/
├── docs/
└── scripts/
```

## Documentation

- docs/ARCHITECTURE.md

- docs/SDK.md

- docs/OPERATIONS.md

- docs/SSS-1.md

- docs/SSS-2.md

- docs/COMPLIANCE.md

- docs/API.md

- docs/CLI.md

- docs/DEPLOYMENT.md

- docs/HACKATHON-DELIVERABLES.md

- docs/HACKATHON-SUBMISSION.md

- docs/HACKATHON-SUBMISSION-TEMPLATE.md

## License

MIT
