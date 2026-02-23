# SSS-2: Compliant Stablecoin Standard

## Summary

SSS-2 extends SSS-1 with compliance controls.
It enables on-chain blacklisting and seizure while enforcing transfer rules through
Token-2022 TransferHook.

## Compliance Features

- TransferHook enforcement: deny transfers when sender or receiver is blacklisted.

- Blacklist registry: on-chain BlacklistEntry PDA per wallet.

- Seizure flow: permanent delegate allows forced transfer to treasury.

## Token-2022 Extensions

- MintCloseAuthority: close authority is the StablecoinConfig PDA.

- MetadataPointer: metadata stored on the mint address.

- TransferHook: enabled and points to the transfer-hook program.

- PermanentDelegate: enabled for seizure flow.

- DefaultAccountState (optional): new accounts can be created as Frozen.

## Transfer Hook Flow

TransferChecked

  | Token-2022
  v
transfer-hook program

  | loads StablecoinConfig + BlacklistEntry PDAs
  v
allow or deny transfer

## Blacklist and Seizure Model

Blacklist PDA

  Seed: ["blacklist", config, wallet]

Seizure requirements

- caller has MASTER_AUTHORITY or SEIZER role.

- permanent_delegate feature enabled.

- wallet is blacklisted and token account is Frozen.

## Instructions (SSS-2 additions)

- add_to_blacklist: create or activate a blacklist entry.

- remove_from_blacklist: deactivate a blacklist entry.

- seize: move full balance to treasury via permanent delegate.

## Security Considerations

- TransferHook uses external PDA seeds and never writes state.

- Blacklist entries are PDA-owned by stablecoin-core only.

- Seize requires 4-way validation (role, feature, blacklist, frozen).
