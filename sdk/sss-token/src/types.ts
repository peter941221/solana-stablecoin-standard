import type { Keypair, PublicKey } from "@solana/web3.js";
import type { Presets } from "./presets";

export interface CreateStablecoinConfig {
  preset?: Presets;
  name: string;
  symbol: string;
  decimals?: number;
  uri?: string;
  authority: Keypair;
  extensions?: {
    permanentDelegate?: boolean;
    transferHook?: boolean;
    defaultAccountFrozen?: boolean;
    confidentialTransfer?: boolean;
  };
}

export enum Role {
  MASTER_AUTHORITY = 0x01,
  MINTER = 0x02,
  BURNER = 0x04,
  FREEZER = 0x08,
  PAUSER = 0x10,
  BLACKLISTER = 0x20,
  SEIZER = 0x40,
}

export interface MintParams {
  recipient: PublicKey;
  amount: bigint | number;
  minter?: Keypair;
}

export interface BurnParams {
  amount: bigint | number;
  burner?: Keypair;
}

export interface StablecoinConfigData {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  isPaused: boolean;
}

export interface RoleAccountData {
  authority: PublicKey;
  roles: number;
  mintQuota?: bigint;
}

export interface BlacklistEntryData {
  wallet: PublicKey;
  isActive: boolean;
  reason?: string;
}

export interface BlacklistStatus {
  isBlacklisted: boolean;
  entry?: BlacklistEntryData;
}

export interface AuditLogEntry {
  signature: string;
  timestamp: string;
  action: string;
  data: Record<string, unknown>;
}

export interface AuditLogFilters {
  action?: string;
  from?: string;
  to?: string;
}
