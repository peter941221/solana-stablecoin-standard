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
  - initialize: qWxMWUiZcoqdTefgYY6DbuHx6vDqusFGR2yTaQYGpzxNsKjCuTpidgeTSpC5fSahcB3C86aGbKBmy1gAreCQTnE
  - mint: 24s4Ygzqq4RMQ5KTb72tfTFaHaadYs29zjJ7ymr4whj1JavTSVruCQGyJci4EwNWFpqxXW5N7oss4QU29rNbnGBU
  - transfer: 5M2LMJERhrPKsMkYqZ1dddjGndeuiBzXJMemcTM9CVxrxaFETXFzuKqxRULC5wmfaEsaJyKwVGS4oUpSxaEARNua
  - freeze: 5NkLBSFC1w9dWrbzSokZVGKScwQYumzkJDCQuNWxnLUfSfD7wVqWtjXg3EsBp5pNkE1g38qoS111Gf6JzJXnmA7r
  - thaw: 5nubJuveUjXieEPDokU6eJB4AZ1muKGu7yLJvANw4n7uR3RYJqf9VC9TCJWryJt14SoPe4LHZ7X7Y71AXEJpCifg
  - burn: 62fHXTRsyH6UTvmpQVJRLJ8jSU18TAnYu71UQjoWVqMuMhTWrV11kumPKPiNM1qHni7mtGLHKHdhmzaU15abESpM

- SSS-2 proof: deployments/devnet-sss2-proof.json
  - initialize: 2gc9NDVEyzPdwhsz7nSSRZ8w6RmqXUKptSYLqRJx3CRwRAmJ1bXebcQy3EVH6wEfdWayPR3XRLGGRAyvBsP9A2Mm
  - mint: 2CMbp6qKEQS5ueV2JgcZa5daxkwcS4X7SmTKM2Aj1b9VtPkcGf2S3ZDSJbcfJY3E2ozMLbja8Sdw5YYkVsUWxdd3
  - transfer: 5twx13Yp3MW7HEEmy2zQaJK2mfdzM43gDSAXdpacjpVgconYxpASW6Sb2JuSAsjQsKXooAFvsTDBse8jHD9hXcgH
  - blacklist: 5GeX6sHjpDEhgkWXHBhnSB3PJX9PyvzikanXPUDMpYkNhEDE1jZom3aCLgSBFnnmt3Q2XmMYSAjdHiiZRm3qZaPb
  - blocked transfer: expected (see blockedTransferError)
  - freeze: FBE2M6VuKCQekyhMSWV4ygyjFd7Q69WsQh2TLm2n99aaEKo7XUtkKG1A2vdVUhYdKKfzJW4mdmXdLnyc5N1fvY5
  - seize: Sj7QJvxwYnWY3UHBDGHMrGkkTdHwHMa99M5BJ7qSjsjj6auivW8oUCXE6PYkSErZxrtRjcwCYYqpjTnJayCyt44

## Verification

- PowerShell: scripts/verify-devnet.ps1

- PowerShell dry run: pwsh scripts/verify-devnet.ps1 -DryRun

- Bash: bash scripts/verify-devnet.sh

- Bash dry run: bash scripts/verify-devnet.sh --dry-run

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
