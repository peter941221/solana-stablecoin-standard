import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";

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
import { UnsupportedPresetError } from "./errors";
import {
  buildBurnInstruction,
  buildFreezeInstruction,
  buildInitializeInstruction,
  buildMintInstruction,
  buildPauseInstruction,
  buildThawInstruction,
  buildUnpauseInstruction,
} from "./instructions";
import {
  decodeBlacklistEntry,
  decodeRoleAccount,
  decodeStablecoinConfig,
  findBlacklistEntryPda,
  findConfigPda,
  findExtraAccountMetasPda,
  findRoleAccountPda,
  getAssociatedTokenAddress,
  sendInstructions,
  STABLECOIN_CORE_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "./utils";

type PresetLabel = "SSS-1" | "SSS-2" | "custom";

interface StablecoinFeatures {
  permanentDelegate: boolean;
  transferHook: boolean;
  confidential: boolean;
  defaultFrozen: boolean;
}

interface ResolvedPreset {
  label: PresetLabel;
  features: StablecoinFeatures;
}

function resolvePreset(config: CreateStablecoinConfig): ResolvedPreset {
  const hasExtensions = !!config.extensions && Object.keys(config.extensions).length > 0;
  const basePreset = config.preset ?? (hasExtensions ? "custom" : Presets.SSS_1);

  const baseFeatures: StablecoinFeatures = {
    permanentDelegate: basePreset === Presets.SSS_2,
    transferHook: basePreset === Presets.SSS_2,
    confidential: false,
    defaultFrozen: false,
  };

  const features: StablecoinFeatures = {
    permanentDelegate:
      config.extensions?.permanentDelegate ?? baseFeatures.permanentDelegate,
    transferHook: config.extensions?.transferHook ?? baseFeatures.transferHook,
    confidential:
      config.extensions?.confidentialTransfer ?? baseFeatures.confidential,
    defaultFrozen:
      config.extensions?.defaultAccountFrozen ?? baseFeatures.defaultFrozen,
  };

  if (features.confidential) {
    throw new UnsupportedPresetError("Confidential transfer not supported");
  }

  let label: PresetLabel = "custom";
  if (basePreset === Presets.SSS_1 || basePreset === Presets.SSS_2) {
    const expected = basePreset === Presets.SSS_2
      ? { permanentDelegate: true, transferHook: true }
      : { permanentDelegate: false, transferHook: false };
    if (
      features.permanentDelegate === expected.permanentDelegate &&
      features.transferHook === expected.transferHook &&
      !hasExtensions
    ) {
      label = basePreset === Presets.SSS_2 ? "SSS-2" : "SSS-1";
    } else if (
      features.permanentDelegate === expected.permanentDelegate &&
      features.transferHook === expected.transferHook &&
      !config.extensions?.defaultAccountFrozen &&
      !config.extensions?.confidentialTransfer
    ) {
      label = basePreset === Presets.SSS_2 ? "SSS-2" : "SSS-1";
    }
  }

  return { label, features };
}

export class SolanaStablecoin {
  readonly mintAddress: PublicKey;
  readonly configPda: PublicKey;
  readonly preset: PresetLabel;
  readonly compliance: ComplianceModule;
  readonly roles: RoleManager;

  private constructor(
    private readonly connection: Connection,
    mint: PublicKey,
    configPda: PublicKey,
    preset: PresetLabel,
    private readonly authority?: Keypair,
    private readonly programId: PublicKey = STABLECOIN_CORE_PROGRAM_ID,
    private readonly features?: StablecoinFeatures,
  ) {
    this.mintAddress = mint;
    this.configPda = configPda;
    this.preset = preset;
    const transferHookEnabled = features?.transferHook ?? preset === "SSS-2";
    const permanentDelegateEnabled = features?.permanentDelegate ?? preset === "SSS-2";
    this.compliance = new ComplianceModule({
      connection,
      configPda,
      mint,
      authority,
      programId,
      transferHookEnabled,
      permanentDelegateEnabled,
    });
    this.roles = new RoleManager({
      connection,
      configPda,
      authority,
      programId,
    });
  }

  static async create(
    connection: Connection,
    config: CreateStablecoinConfig,
  ): Promise<SolanaStablecoin> {
    const resolved = resolvePreset(config);
    const mintKeypair = Keypair.generate();
    const programId = STABLECOIN_CORE_PROGRAM_ID;

    const configPda = findConfigPda(mintKeypair.publicKey, programId)[0];
    const roleAccountPda = findRoleAccountPda(
      configPda,
      config.authority.publicKey,
      programId,
    )[0];

    const transferHookProgramId = resolved.features.transferHook
      ? TRANSFER_HOOK_PROGRAM_ID
      : undefined;
    const extraAccountMetasPda = transferHookProgramId
      ? findExtraAccountMetasPda(mintKeypair.publicKey, transferHookProgramId)[0]
      : undefined;

    const instruction = buildInitializeInstruction({
      authority: config.authority.publicKey,
      mint: mintKeypair.publicKey,
      name: config.name,
      symbol: config.symbol,
      uri: config.uri ?? "",
      decimals: config.decimals ?? 6,
      enablePermanentDelegate: resolved.features.permanentDelegate,
      enableTransferHook: resolved.features.transferHook,
      defaultAccountFrozen: resolved.features.defaultFrozen,
      transferHookProgramId,
      configPda,
      roleAccountPda,
      extraAccountMetasPda,
      programId,
    });

    await sendInstructions(
      connection,
      [instruction],
      [config.authority, mintKeypair],
    );

    return new SolanaStablecoin(
      connection,
      mintKeypair.publicKey,
      configPda,
      resolved.label,
      config.authority,
      programId,
      resolved.features,
    );
  }

  static async fromExisting(
    connection: Connection,
    mint: PublicKey,
    authority: Keypair,
  ): Promise<SolanaStablecoin> {
    const programId = STABLECOIN_CORE_PROGRAM_ID;
    const configPda = findConfigPda(mint, programId)[0];
    const configAccount = await connection.getAccountInfo(configPda);
    if (!configAccount) {
      throw new Error("Stablecoin config not found");
    }
    const decoded = decodeStablecoinConfig(configAccount.data);
    const preset: PresetLabel = decoded.features.transferHook ? "SSS-2" : "SSS-1";
    const features: StablecoinFeatures = {
      permanentDelegate: decoded.features.permanentDelegate,
      transferHook: decoded.features.transferHook,
      confidential: decoded.features.confidential,
      defaultFrozen: decoded.features.defaultFrozen,
    };
    return new SolanaStablecoin(
      connection,
      mint,
      configPda,
      preset,
      authority,
      programId,
      features,
    );
  }

  async mint(params: MintParams): Promise<string> {
    const minter = params.minter ?? this.authority;
    if (!minter) {
      throw new Error("Missing minter keypair");
    }
    const instruction = buildMintInstruction({
      minter: minter.publicKey,
      mint: this.mintAddress,
      recipient: params.recipient,
      amount: params.amount,
      configPda: this.configPda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [minter]);
  }

  async burn(params: BurnParams): Promise<string> {
    const burner = params.burner ?? this.authority;
    if (!burner) {
      throw new Error("Missing burner keypair");
    }
    const burnerAta = getAssociatedTokenAddress(this.mintAddress, burner.publicKey, {
      tokenProgramId: TOKEN_2022_PROGRAM_ID,
    });
    const instruction = buildBurnInstruction({
      burner: burner.publicKey,
      mint: this.mintAddress,
      burnerAta,
      amount: params.amount,
      configPda: this.configPda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [burner]);
  }

  async freeze(tokenAccount: PublicKey): Promise<string> {
    const freezer = this.authority;
    if (!freezer) {
      throw new Error("Missing freezer keypair");
    }
    const instruction = buildFreezeInstruction({
      freezer: freezer.publicKey,
      mint: this.mintAddress,
      targetAta: tokenAccount,
      configPda: this.configPda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [freezer]);
  }

  async thaw(tokenAccount: PublicKey): Promise<string> {
    const freezer = this.authority;
    if (!freezer) {
      throw new Error("Missing freezer keypair");
    }
    const instruction = buildThawInstruction({
      freezer: freezer.publicKey,
      mint: this.mintAddress,
      targetAta: tokenAccount,
      configPda: this.configPda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [freezer]);
  }

  async pause(): Promise<string> {
    const pauser = this.authority;
    if (!pauser) {
      throw new Error("Missing pauser keypair");
    }
    const instruction = buildPauseInstruction({
      pauser: pauser.publicKey,
      configPda: this.configPda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [pauser]);
  }

  async unpause(): Promise<string> {
    const pauser = this.authority;
    if (!pauser) {
      throw new Error("Missing pauser keypair");
    }
    const instruction = buildUnpauseInstruction({
      pauser: pauser.publicKey,
      configPda: this.configPda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [pauser]);
  }

  async getTotalSupply(): Promise<bigint> {
    const supply = await this.connection.getTokenSupply(this.mintAddress);
    return BigInt(supply.value.amount);
  }

  async getConfig(): Promise<StablecoinConfigData> {
    const accountInfo = await this.connection.getAccountInfo(this.configPda);
    if (!accountInfo) {
      throw new Error("Stablecoin config not found");
    }
    const decoded = decodeStablecoinConfig(accountInfo.data);
    return {
      authority: decoded.authority,
      mint: decoded.mint,
      name: decoded.name,
      symbol: decoded.symbol,
      uri: decoded.uri,
      decimals: decoded.decimals,
      isPaused: decoded.isPaused,
    };
  }

  async getTokenAccountBalance(owner: PublicKey): Promise<bigint> {
    const ata = getAssociatedTokenAddress(this.mintAddress, owner, {
      tokenProgramId: TOKEN_2022_PROGRAM_ID,
    });
    try {
      const balance = await this.connection.getTokenAccountBalance(ata);
      return BigInt(balance.value.amount);
    } catch {
      return 0n;
    }
  }

  async isPaused(): Promise<boolean> {
    const config = await this.getConfig();
    return config.isPaused;
  }

  async getBlacklistedAddresses(): Promise<BlacklistEntryData[]> {
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

  async getBlacklistStatus(wallet: PublicKey): Promise<BlacklistStatus> {
    const entryPda = findBlacklistEntryPda(this.configPda, wallet, this.programId)[0];
    const accountInfo = await this.connection.getAccountInfo(entryPda);
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

  async getRoles(target: PublicKey): Promise<RoleAccountData | null> {
    const rolePda = findRoleAccountPda(this.configPda, target, this.programId)[0];
    const accountInfo = await this.connection.getAccountInfo(rolePda);
    if (!accountInfo) {
      return null;
    }
    const decoded = decodeRoleAccount(accountInfo.data);
    return {
      authority: decoded.authority,
      roles: decoded.roles,
      mintQuota: decoded.mintQuota ?? undefined,
    };
  }

  async getAuditLog(_filters?: AuditLogFilters): Promise<AuditLogEntry[]> {
    return [];
  }
}
