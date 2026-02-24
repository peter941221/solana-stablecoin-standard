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
  - initialize: zRQV34z9B5d1fBq5tsBCSKj9cR7tCoBSt8A4xSQ6bSTksa8b3CKPtKLCQGVNkvA5ezKWRJbZwyd3G6Cr8ZrdEwF
  - mint: 3vxxPcoTig11Gh7a1nzEdTsjKEeR9QETuuBc9gFvPXcPoDark94USTmVawFRHxtJBr5TBLwrC64drB9fWLWdKZPP
  - transfer: 5wg8w9qvnGozA4gH1G1bH1Upi8E64ePirSBcPUzJKM4RMbBskxYyX2v4BxgLeKE5HXNe9CxgExWtJLhVpMZ2svQ6
  - freeze: 5jGAYDT8V3nEqQtZsnvff3yX65apXauW93gqmMmPQWun9em71rabdZwuhwz4Kf3a6NHXXyg3coRASMg8YayGC64x
  - thaw: 4jm6ERrn4Zm9uKmsxp7XEcnRvAWWRPdEeSq8VSZG5hQkfZEfizeovdvh7W4Evd24WfCVGLLZdS2DuhM9usQfNY5z
  - burn: fVxpAMWG2p5oCWA41nwsjDzQodLNpdeKykueQhzm8XxuWKhUsQFb3WUheWq1i3bfhxqGJVXdRimiCCDjph91HoM

- SSS-2 proof: deployments/devnet-sss2-proof.json
  - initialize: 4YJrXkUqqccdjTeAPjF7BnKWvmBhfvxtQT1duGRWE3ECx3YTsruWrZ5uUSfVX3CvEGZau77JTxr6FeeiePhxApet
  - mint: oq6WfnRaNjpvt2Mb8Kfdh1JoGW8gEXxnSgNNdU1Gsp5QyxUqUXL5NseiPqqD6fpEJ4AaWuMp8AHkBUZKixYzXiE
  - transfer: 5bJ9oLUK3UKEER8MLwUmbLiD9dfLD8zJ8EsHzSGXi3C9SX8aXQxsugwr28PFku1rUkoAAgxCikdBQ7Y5MGw4SqfL
  - blacklist: 3ZRy9JtutK64erCTWLKUKVGt4iX66GWGfcQ4nneWJyRxQrqp1Mswgv5ny93V5zbuBrTQ7SmCBa4jJaocPfYY66k2
  - blocked transfer: expected (see blockedTransferError)
  - freeze: 4J4sKZr9wFn9tUMsGWDsf4wne92xSnsuPHNyvx3JW4r9hc9wDvBjoK5QpF4Zuaw3vGjckEXnNUNh1CDF5WM2cEqK
  - seize: 25JQnjw8faxQHt8ej7NAvT2YrRGSXkhxWpSEMfUyMpB87pvRq9nPrpwWXsxyABSjnLB34KUa8cdkACw6fKGZK9rP

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
