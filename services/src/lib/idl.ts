import type { Idl } from "@coral-xyz/anchor";

export const stablecoinIdl = {
  version: "0.1.0",
  name: "stablecoin_core",
  instructions: [],
  accounts: [],
  events: [
    {
      name: "StablecoinInitialized",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "mint", type: "publicKey", index: false },
        { name: "authority", type: "publicKey", index: false },
        { name: "name", type: "string", index: false },
        { name: "symbol", type: "string", index: false },
        { name: "preset", type: "string", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "TokensMinted",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "mint", type: "publicKey", index: false },
        { name: "recipient", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "minter", type: "publicKey", index: false },
        { name: "new_total_supply", type: "u64", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "TokensBurned",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "mint", type: "publicKey", index: false },
        { name: "burner", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "new_total_supply", type: "u64", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "AccountFrozen",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "target_account", type: "publicKey", index: false },
        { name: "frozen_by", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "AccountThawed",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "target_account", type: "publicKey", index: false },
        { name: "thawed_by", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "SystemPaused",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "paused_by", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "SystemUnpaused",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "unpaused_by", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "RoleUpdated",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "target", type: "publicKey", index: false },
        { name: "new_roles", type: "u8", index: false },
        { name: "updated_by", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "AuthorityTransferred",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "old_authority", type: "publicKey", index: false },
        { name: "new_authority", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "BlacklistAdded",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "wallet", type: "publicKey", index: false },
        { name: "reason", type: "string", index: false },
        { name: "blacklisted_by", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "BlacklistRemoved",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "wallet", type: "publicKey", index: false },
        { name: "removed_by", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "TokensSeized",
      fields: [
        { name: "config", type: "publicKey", index: false },
        { name: "from_account", type: "publicKey", index: false },
        { name: "to_account", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "seized_by", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
  ],
  types: [],
  errors: [],
  constants: [],
} as unknown as Idl;
