import type { PublicKey } from "@solana/web3.js";

import type { AuditLogEntry, AuditLogFilters, BlacklistEntryData, BlacklistStatus } from "../types";
import { FeatureNotEnabledError } from "../errors";

export class ComplianceModule {
  constructor(private readonly enabled: boolean) {}

  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new FeatureNotEnabledError();
    }
  }

  async blacklistAdd(_wallet: PublicKey, _reason: string): Promise<string> {
    this.ensureEnabled();
    throw new Error("Not implemented");
  }

  async blacklistRemove(_wallet: PublicKey): Promise<string> {
    this.ensureEnabled();
    throw new Error("Not implemented");
  }

  async blacklistCheck(_wallet: PublicKey): Promise<BlacklistStatus> {
    this.ensureEnabled();
    throw new Error("Not implemented");
  }

  async seize(_targetTokenAccount: PublicKey, _treasuryTokenAccount: PublicKey): Promise<string> {
    this.ensureEnabled();
    throw new Error("Not implemented");
  }

  async getBlacklistedAddresses(): Promise<BlacklistEntryData[]> {
    this.ensureEnabled();
    throw new Error("Not implemented");
  }

  async getAuditLog(_filters?: AuditLogFilters): Promise<AuditLogEntry[]> {
    this.ensureEnabled();
    throw new Error("Not implemented");
  }
}
