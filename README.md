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

## License

MIT
