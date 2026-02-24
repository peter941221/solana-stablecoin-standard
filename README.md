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
  - initialize: 2B1HUHGmFsuvB1sxNyyYZ98PnZMB3J2RFwx5oQgpsDo6v44spKMu4XyyD7DPeP5FGqa19Tp2EjUUD65vznVSSmzt
  - mint: cXzeKjrxLnQKgZwxryMm5LxA4qH5BgKN5D36viZ2H3mXwXsxLMjvH4XWYBguRp84xbpC4SETJkxWjHxvhRMpGX8
  - transfer: 2Bi5LRsXmZqGjfinXxPMJPgGTKaK2dBf5qvfP4DJFJfHUbYNgQ8PUTjMim91s4tTtESkUwmQVTPQwYdZrDTMj6N8
  - freeze: m2P53zhFNPcpYdgJN2DasBgxUSRAQFQCdR63JYc4AZRJJuM8GsgXM4TdEzhib3MjH4txP59pCdHkwTkcUnfVTrZ
  - thaw: 2fnwS4ao1wjDPhizyZBEuMbJKrwXukRyPWcvAgU2ivGhoLwhkiya5zWcJgPxJcNwZCEmMfMzLZiRLN6zZvtPrV9e
  - burn: 3C6mDEAtuSLpJU7oBE9aWnnhXdqyswzaTRzyd87tpe7tFch9o2aYvCUb5RhUySMNYFvvVnPSTT2zXcgBG3tbUbqb

- SSS-2 proof: deployments/devnet-sss2-proof.json
  - initialize: 3VDckxT5dVGH3SFGcZ28NAyKyeJHZp14AjtC4AoQMqzJu6uPeyhiWXnskDrvukZEsj5f7aFUE7G49MdSCTsqTuLa
  - mint: 3iYD3FCH24z2cyF1gviBeD6oygXK2mhjv9zAvbVy9L3hVQnf4KFQw1SkKF5fU2UY7CbdgkuDVCqT1gr7Y9VEv71Y
  - transfer: 4bCgiiykjWw1ReZufPRKN2c21oXHJF6ZGa5hyWxkXszZiD1EyAKZeXrafmCjyKob2BET2s7JSVGddyr1ReXpx9Fs
  - blacklist: 3hHu7ksxTMo1KhGGxjhohUsaMHv129xB6s2YrGy2TCh3XNh1fRztQApTm1EEpCJDvq2NUamFY1AWBx8GpP6rEYsg
  - blocked transfer: expected (see blockedTransferError)
  - freeze: 5JNQJUok88Vet6TxcZ5yFRmXtRdaU1oB39PMyExt7LCNEKgm3zbKeNfakKM6uDtE5j8VVg3q8c7XjWnGRHNWZnbG
  - seize: 4XAAoQQTNQnAe6STVGKiGCbL8kRJPLeUW9tZ9fMddjicHxGVZHVimLHX33J8chqyLT58ncXzRP4zmoAgtTr15yNg

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

## License

MIT
