import type { Connection, PublicKey, Keypair } from "@solana/web3.js";

import type {
  AuditLogEntry,
  AuditLogFilters,
  BlacklistEntryData,
  BlacklistStatus,
  BurnParams,
  CreateStablecoinConfig,
  MintParams,
  RoleAccountData,
  StablecoinConfigData,
} from "./types";
import { Presets } from "./presets";
import { ComplianceModule } from "./modules/compliance";
import { RoleManager } from "./modules/roles";

export class SolanaStablecoin {
  readonly mint: PublicKey;
  readonly configPda: PublicKey;
  readonly preset: "SSS-1" | "SSS-2" | "custom";
  readonly compliance: ComplianceModule;
  readonly roles: RoleManager;

  private constructor(
    private readonly connection: Connection,
    mint: PublicKey,
    configPda: PublicKey,
    preset: "SSS-1" | "SSS-2" | "custom",
  ) {
    this.mint = mint;
    this.configPda = configPda;
    this.preset = preset;
    this.compliance = new ComplianceModule(preset === "SSS-2");
    this.roles = new RoleManager();
  }

  static async create(
    connection: Connection,
    config: CreateStablecoinConfig,
  ): Promise<SolanaStablecoin> {
    const _ = connection;
    const __ = config;
    throw new Error("Not implemented");
  }

  static async fromExisting(
    connection: Connection,
    mint: PublicKey,
    authority: Keypair,
  ): Promise<SolanaStablecoin> {
    const _ = connection;
    const __ = mint;
    const ___ = authority;
    throw new Error("Not implemented");
  }

  async mint(params: MintParams): Promise<string> {
    const _ = params;
    throw new Error("Not implemented");
  }

  async burn(params: BurnParams): Promise<string> {
    const _ = params;
    throw new Error("Not implemented");
  }

  async freeze(tokenAccount: PublicKey): Promise<string> {
    const _ = tokenAccount;
    throw new Error("Not implemented");
  }

  async thaw(tokenAccount: PublicKey): Promise<string> {
    const _ = tokenAccount;
    throw new Error("Not implemented");
  }

  async pause(): Promise<string> {
    throw new Error("Not implemented");
  }

  async unpause(): Promise<string> {
    throw new Error("Not implemented");
  }

  async getTotalSupply(): Promise<bigint> {
    throw new Error("Not implemented");
  }

  async getConfig(): Promise<StablecoinConfigData> {
    throw new Error("Not implemented");
  }

  async getTokenAccountBalance(_owner: PublicKey): Promise<bigint> {
    throw new Error("Not implemented");
  }

  async isPaused(): Promise<boolean> {
    throw new Error("Not implemented");
  }

  async getBlacklistedAddresses(): Promise<BlacklistEntryData[]> {
    throw new Error("Not implemented");
  }

  async getBlacklistStatus(_wallet: PublicKey): Promise<BlacklistStatus> {
    throw new Error("Not implemented");
  }

  async getRoles(_target: PublicKey): Promise<RoleAccountData | null> {
    throw new Error("Not implemented");
  }

  async getAuditLog(_filters?: AuditLogFilters): Promise<AuditLogEntry[]> {
    throw new Error("Not implemented");
  }
}
