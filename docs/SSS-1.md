# SSS-1: Minimal Stablecoin Standard

## Summary

SSS-1 defines the minimal stablecoin profile on Solana Token-2022.
It focuses on mint, burn, freeze, and pause with strict role-based access control.

## Token-2022 Extensions

- MintCloseAuthority: close authority is the StablecoinConfig PDA.

- MetadataPointer: metadata stored on the mint address.

- DefaultAccountState (optional): new accounts can be created as Frozen.

- PermanentDelegate: disabled in SSS-1.

- TransferHook: disabled in SSS-1.

## Accounts (PDA Model)

StablecoinConfig PDA

  Seed: ["stablecoin", mint]

RoleAccount PDA

  Seed: ["role", config, authority]


ASCII view

+--------------------+        +-------------------+
| StablecoinConfig   |        | RoleAccount       |
| PDA                |        | PDA               |
+--------------------+        +-------------------+
| mint               |        | authority         |
| authority          |        | roles (bitmask)   |
| feature flags      |        | mint quota        |
+--------------------+        +-------------------+

## Instructions

- initialize: create mint, config, and master role.

- mint: issue tokens to a recipient ATA.

- burn: destroy tokens from the caller ATA.

- freeze_account / thaw_account: freeze or thaw a token account.

- pause / unpause: pause or resume mint and burn.

- update_roles: grant or revoke roles for an address.

- update_minter: update a minter quota.

- transfer_authority: move master authority to a new address.

## Roles

Bitmask values

- 0x01 MASTER_AUTHORITY

- 0x02 MINTER

- 0x04 BURNER

- 0x08 FREEZER

- 0x10 PAUSER

## Security Considerations

- PDA signing: config PDA is the mint authority and freeze authority.

- Role checks: every privileged instruction validates role bitmask.

- Feature gating: SSS-1 rejects compliance-only roles and instructions.

- Quota windows: minter quotas are enforced per time window.
