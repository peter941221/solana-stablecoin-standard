# Architecture

## Three-Layer Model

L1 Base SDK -> L2 Modules -> L3 Presets

+------------------+     +------------------+     +------------------+
| Base SDK (L1)    | --> | Modules (L2)     | --> | Presets (L3)     |
| tx builders      |     | compliance       |     | SSS-1, SSS-2     |
| PDA helpers      |     | roles            |     | custom configs   |
+------------------+     +------------------+     +------------------+

## On-Chain Programs

- stablecoin-core: single configurable program for SSS-1 and SSS-2.

- transfer-hook: independent program for blacklist enforcement.

## Data Flow: Mint

Client

  | build instruction
  v
stablecoin-core

  | PDA signs mint
  v
Token-2022

## Data Flow: Transfer Hook (SSS-2)

Token-2022

  | CPI
  v
transfer-hook

  | read StablecoinConfig + BlacklistEntry
  v
allow or deny transfer

## Data Flow: Seize (SSS-2)

stablecoin-core

  | permanent delegate
  v
Token-2022 transfer_checked

  | move balance to treasury
  v
audit event emitted

## Security Model

- Role separation via RoleAccount PDA.

- Feature gating for compliance-only instructions.

- PDA authority for mint, freeze, and metadata.
