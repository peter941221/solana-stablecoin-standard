import type { Connection } from "@solana/web3.js";
import { Keypair, PublicKey } from "@solana/web3.js";

import type { AuditLogEntry, AuditLogFilters, BlacklistEntryData, BlacklistStatus } from "../types";
import { FeatureNotEnabledError } from "../errors";
import {
  buildAddToBlacklistInstruction,
  buildRemoveFromBlacklistInstruction,
  buildSeizeInstruction,
} from "../instructions";
import {
  decodeBlacklistEntry,
  findBlacklistEntryPda,
  sendInstructions,
  STABLECOIN_CORE_PROGRAM_ID,
} from "../utils";

interface ComplianceContext {
  connection: Connection;
  configPda: PublicKey;
  mint: PublicKey;
  authority?: Keypair;
  programId?: PublicKey;
  transferHookEnabled: boolean;
  permanentDelegateEnabled: boolean;
}

export class ComplianceModule {
  private readonly connection: Connection;
  private readonly configPda: PublicKey;
  private readonly mint: PublicKey;
  private readonly authority?: Keypair;
  private readonly programId: PublicKey;
  private readonly transferHookEnabled: boolean;
  private readonly permanentDelegateEnabled: boolean;

  constructor(context: ComplianceContext) {
    this.connection = context.connection;
    this.configPda = context.configPda;
    this.mint = context.mint;
    this.authority = context.authority;
    this.programId = context.programId ?? STABLECOIN_CORE_PROGRAM_ID;
    this.transferHookEnabled = context.transferHookEnabled;
    this.permanentDelegateEnabled = context.permanentDelegateEnabled;
  }

  private ensureEnabled(): void {
    if (!this.transferHookEnabled) {
      throw new FeatureNotEnabledError();
    }
  }

  private ensureSeizeEnabled(): void {
    if (!this.permanentDelegateEnabled) {
      throw new FeatureNotEnabledError("Permanent delegate not enabled");
    }
  }

  private requireAuthority(): Keypair {
    if (!this.authority) {
      throw new Error("Missing authority keypair");
    }
    return this.authority;
  }

  async blacklistAdd(wallet: PublicKey, reason: string): Promise<string> {
    this.ensureEnabled();
    const authority = this.requireAuthority();
    const instruction = buildAddToBlacklistInstruction({
      blacklister: authority.publicKey,
      configPda: this.configPda,
      wallet,
      reason,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [authority]);
  }

  async blacklistRemove(wallet: PublicKey): Promise<string> {
    this.ensureEnabled();
    const authority = this.requireAuthority();
    const blacklistEntryPda = findBlacklistEntryPda(
      this.configPda,
      wallet,
      this.programId,
    )[0];
    const instruction = buildRemoveFromBlacklistInstruction({
      blacklister: authority.publicKey,
      configPda: this.configPda,
      blacklistEntryPda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [authority]);
  }

  async blacklistCheck(wallet: PublicKey): Promise<BlacklistStatus> {
    this.ensureEnabled();
    const blacklistEntryPda = findBlacklistEntryPda(
      this.configPda,
      wallet,
      this.programId,
    )[0];
    const accountInfo = await this.connection.getAccountInfo(blacklistEntryPda);
    if (!accountInfo) {
      return { isBlacklisted: false };
    }
    const decoded = decodeBlacklistEntry(accountInfo.data);
    const entry: BlacklistEntryData = {
      wallet: decoded.wallet,
      isActive: decoded.isActive,
      reason: decoded.reason.length > 0 ? decoded.reason : undefined,
    };
    return {
      isBlacklisted: decoded.isActive,
      entry,
    };
  }

  async seize(
    targetTokenAccount: PublicKey,
    treasuryTokenAccount: PublicKey,
  ): Promise<string> {
    this.ensureEnabled();
    this.ensureSeizeEnabled();
    const authority = this.requireAuthority();
    const parsedAccount = await this.connection.getParsedAccountInfo(
      targetTokenAccount,
      "confirmed",
    );
    const parsedData = parsedAccount.value?.data;
    if (!parsedData || typeof parsedData !== "object" || !("parsed" in parsedData)) {
      throw new Error("Unable to resolve token account owner");
    }
    const ownerAddress = (parsedData as { parsed: { info: { owner: string } } }).parsed.info
      .owner;
    const owner = new PublicKey(ownerAddress);
    const blacklistEntry = findBlacklistEntryPda(this.configPda, owner, this.programId)[0];

    const instruction = buildSeizeInstruction({
      seizer: authority.publicKey,
      configPda: this.configPda,
      mint: this.mint,
      targetAta: targetTokenAccount,
      treasuryAta: treasuryTokenAccount,
      blacklistEntry,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [authority]);
  }

  async getBlacklistedAddresses(): Promise<BlacklistEntryData[]> {
    this.ensureEnabled();
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        {
          memcmp: {
            offset: 8,
            bytes: this.configPda.toBase58(),
          },
        },
      ],
    });

    const entries: BlacklistEntryData[] = [];
    for (const account of accounts) {
      try {
        const decoded = decodeBlacklistEntry(account.account.data);
        if (!decoded.isActive) {
          continue;
        }
        entries.push({
          wallet: decoded.wallet,
          isActive: decoded.isActive,
          reason: decoded.reason.length > 0 ? decoded.reason : undefined,
        });
      } catch {
        continue;
      }
    }
    return entries;
  }

  async getAuditLog(_filters?: AuditLogFilters): Promise<AuditLogEntry[]> {
    return [];
  }
}
