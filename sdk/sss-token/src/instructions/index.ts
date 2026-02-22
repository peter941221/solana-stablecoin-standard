import { createHash } from "node:crypto";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

import {
  STABLECOIN_CORE_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  findBlacklistEntryPda,
  findConfigPda,
  findExtraAccountMetasPda,
  findRoleAccountPda,
  getAssociatedTokenAddress,
} from "../utils";

type Amount = bigint | number;

type Optional<T> = T | null | undefined;

class BorshWriter {
  private readonly parts: Buffer[] = [];

  writeU8(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError("u8 value out of range");
    }
    this.parts.push(Buffer.from([value]));
  }

  writeBool(value: boolean): void {
    this.writeU8(value ? 1 : 0);
  }

  writeU64(value: Amount): void {
    const bigValue = typeof value === "bigint" ? value : BigInt(value);
    if (bigValue < 0n) {
      throw new RangeError("u64 value must be >= 0");
    }
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(bigValue);
    this.parts.push(buffer);
  }

  writeString(value: string): void {
    const bytes = Buffer.from(value, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32LE(bytes.length);
    this.parts.push(length, bytes);
  }

  writePubkey(value: PublicKey): void {
    this.parts.push(value.toBuffer());
  }

  writeOption<T>(value: Optional<T>, writer: (input: T) => void): void {
    if (value === null || value === undefined) {
      this.writeU8(0);
      return;
    }
    this.writeU8(1);
    writer(value);
  }

  concat(): Buffer {
    return Buffer.concat(this.parts);
  }
}

function anchorDiscriminator(name: string): Buffer {
  const preimage = `global:${name}`;
  return createHash("sha256").update(preimage).digest().subarray(0, 8);
}

function buildInstruction(
  name: string,
  data: Buffer,
  keys: AccountMeta[],
  programId: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.concat([anchorDiscriminator(name), data]),
  });
}

function encodeInitializeArgs(params: {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  transferHookProgramId?: Optional<PublicKey>;
}): Buffer {
  const writer = new BorshWriter();
  writer.writeString(params.name);
  writer.writeString(params.symbol);
  writer.writeString(params.uri);
  writer.writeU8(params.decimals);
  writer.writeBool(params.enablePermanentDelegate);
  writer.writeBool(params.enableTransferHook);
  writer.writeBool(params.defaultAccountFrozen);
  writer.writeOption(params.transferHookProgramId, (value) => writer.writePubkey(value));
  return writer.concat();
}

function encodeUpdateRolesArgs(
  target: PublicKey,
  roles: number,
  mintQuota?: Optional<Amount>,
): Buffer {
  const writer = new BorshWriter();
  writer.writePubkey(target);
  writer.writeU8(roles);
  writer.writeOption(mintQuota, (value) => writer.writeU64(value));
  return writer.concat();
}

function encodeUpdateMinterArgs(newQuota: Amount): Buffer {
  const writer = new BorshWriter();
  writer.writeU64(newQuota);
  return writer.concat();
}

function encodeMintOrBurnArgs(amount: Amount): Buffer {
  const writer = new BorshWriter();
  writer.writeU64(amount);
  return writer.concat();
}

function encodeAddToBlacklistArgs(wallet: PublicKey, reason: string): Buffer {
  const writer = new BorshWriter();
  writer.writePubkey(wallet);
  writer.writeString(reason);
  return writer.concat();
}

export interface InitializeInstructionParams {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals?: number;
  enablePermanentDelegate?: boolean;
  enableTransferHook?: boolean;
  defaultAccountFrozen?: boolean;
  transferHookProgramId?: PublicKey;
  configPda?: PublicKey;
  roleAccountPda?: PublicKey;
  extraAccountMetasPda?: PublicKey;
  token2022ProgramId?: PublicKey;
  systemProgramId?: PublicKey;
  rentSysvarId?: PublicKey;
  programId?: PublicKey;
}

export function buildInitializeInstruction(
  params: InitializeInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const decimals = params.decimals ?? 6;
  const enablePermanentDelegate = params.enablePermanentDelegate ?? false;
  const enableTransferHook = params.enableTransferHook ?? false;
  const defaultAccountFrozen = params.defaultAccountFrozen ?? false;
  const transferHookProgramId =
    params.transferHookProgramId ?? TRANSFER_HOOK_PROGRAM_ID;

  const configPda = params.configPda ?? findConfigPda(params.mint, programId)[0];
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(configPda, params.authority, programId)[0];

  const extraAccountMetasPda = params.extraAccountMetasPda ??
    findExtraAccountMetasPda(params.mint, transferHookProgramId)[0];

  const keys: AccountMeta[] = [
    { pubkey: params.authority, isSigner: true, isWritable: true },
    { pubkey: params.mint, isSigner: true, isWritable: true },
    { pubkey: configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
  ];

  if (enableTransferHook) {
    keys.push({
      pubkey: extraAccountMetasPda,
      isSigner: false,
      isWritable: true,
    });
    keys.push({
      pubkey: transferHookProgramId,
      isSigner: false,
      isWritable: false,
    });
  }

  keys.push({
    pubkey: params.token2022ProgramId ?? TOKEN_2022_PROGRAM_ID,
    isSigner: false,
    isWritable: false,
  });
  keys.push({
    pubkey: params.systemProgramId ?? SystemProgram.programId,
    isSigner: false,
    isWritable: false,
  });
  keys.push({
    pubkey: params.rentSysvarId ?? SYSVAR_RENT_PUBKEY,
    isSigner: false,
    isWritable: false,
  });

  const data = encodeInitializeArgs({
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    decimals,
    enablePermanentDelegate,
    enableTransferHook,
    defaultAccountFrozen,
    transferHookProgramId: enableTransferHook ? transferHookProgramId : null,
  });

  return buildInstruction("initialize", data, keys, programId);
}

export interface MintInstructionParams {
  minter: PublicKey;
  mint: PublicKey;
  recipient: PublicKey;
  amount: Amount;
  configPda?: PublicKey;
  roleAccountPda?: PublicKey;
  recipientAta?: PublicKey;
  token2022ProgramId?: PublicKey;
  associatedTokenProgramId?: PublicKey;
  systemProgramId?: PublicKey;
  programId?: PublicKey;
}

export function buildMintInstruction(params: MintInstructionParams): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const configPda = params.configPda ?? findConfigPda(params.mint, programId)[0];
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(configPda, params.minter, programId)[0];
  const token2022ProgramId = params.token2022ProgramId ?? TOKEN_2022_PROGRAM_ID;
  const recipientAta =
    params.recipientAta ??
    getAssociatedTokenAddress(params.mint, params.recipient, {
      tokenProgramId: token2022ProgramId,
      associatedTokenProgramId:
        params.associatedTokenProgramId ?? ASSOCIATED_TOKEN_PROGRAM_ID,
    });

  const keys: AccountMeta[] = [
    { pubkey: params.minter, isSigner: true, isWritable: true },
    { pubkey: configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.recipient, isSigner: false, isWritable: false },
    { pubkey: recipientAta, isSigner: false, isWritable: true },
    { pubkey: token2022ProgramId, isSigner: false, isWritable: false },
    {
      pubkey: params.associatedTokenProgramId ?? ASSOCIATED_TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: params.systemProgramId ?? SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
  ];

  const data = encodeMintOrBurnArgs(params.amount);
  return buildInstruction("mint", data, keys, programId);
}

export interface BurnInstructionParams {
  burner: PublicKey;
  mint: PublicKey;
  burnerAta: PublicKey;
  amount: Amount;
  configPda?: PublicKey;
  roleAccountPda?: PublicKey;
  token2022ProgramId?: PublicKey;
  programId?: PublicKey;
}

export function buildBurnInstruction(params: BurnInstructionParams): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const configPda = params.configPda ?? findConfigPda(params.mint, programId)[0];
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(configPda, params.burner, programId)[0];
  const token2022ProgramId = params.token2022ProgramId ?? TOKEN_2022_PROGRAM_ID;

  const keys: AccountMeta[] = [
    { pubkey: params.burner, isSigner: true, isWritable: false },
    { pubkey: configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: true },
    { pubkey: params.burnerAta, isSigner: false, isWritable: true },
    { pubkey: token2022ProgramId, isSigner: false, isWritable: false },
  ];

  const data = encodeMintOrBurnArgs(params.amount);
  return buildInstruction("burn", data, keys, programId);
}

export interface FreezeInstructionParams {
  freezer: PublicKey;
  mint: PublicKey;
  targetAta: PublicKey;
  configPda?: PublicKey;
  roleAccountPda?: PublicKey;
  token2022ProgramId?: PublicKey;
  programId?: PublicKey;
}

export function buildFreezeInstruction(
  params: FreezeInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const configPda = params.configPda ?? findConfigPda(params.mint, programId)[0];
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(configPda, params.freezer, programId)[0];
  const token2022ProgramId = params.token2022ProgramId ?? TOKEN_2022_PROGRAM_ID;

  const keys: AccountMeta[] = [
    { pubkey: params.freezer, isSigner: true, isWritable: false },
    { pubkey: configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.targetAta, isSigner: false, isWritable: true },
    { pubkey: token2022ProgramId, isSigner: false, isWritable: false },
  ];

  return buildInstruction("freeze_account", Buffer.alloc(0), keys, programId);
}

export function buildThawInstruction(
  params: FreezeInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const configPda = params.configPda ?? findConfigPda(params.mint, programId)[0];
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(configPda, params.freezer, programId)[0];
  const token2022ProgramId = params.token2022ProgramId ?? TOKEN_2022_PROGRAM_ID;

  const keys: AccountMeta[] = [
    { pubkey: params.freezer, isSigner: true, isWritable: false },
    { pubkey: configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.targetAta, isSigner: false, isWritable: true },
    { pubkey: token2022ProgramId, isSigner: false, isWritable: false },
  ];

  return buildInstruction("thaw_account", Buffer.alloc(0), keys, programId);
}

export interface PauseInstructionParams {
  pauser: PublicKey;
  configPda: PublicKey;
  roleAccountPda?: PublicKey;
  programId?: PublicKey;
}

export function buildPauseInstruction(
  params: PauseInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(params.configPda, params.pauser, programId)[0];

  const keys: AccountMeta[] = [
    { pubkey: params.pauser, isSigner: true, isWritable: false },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
  ];

  return buildInstruction("pause", Buffer.alloc(0), keys, programId);
}

export function buildUnpauseInstruction(
  params: PauseInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(params.configPda, params.pauser, programId)[0];

  const keys: AccountMeta[] = [
    { pubkey: params.pauser, isSigner: true, isWritable: false },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
  ];

  return buildInstruction("unpause", Buffer.alloc(0), keys, programId);
}

export interface UpdateRolesInstructionParams {
  authority: PublicKey;
  configPda: PublicKey;
  target: PublicKey;
  roles: number;
  mintQuota?: Optional<Amount>;
  roleAccountPda?: PublicKey;
  targetRoleAccountPda?: PublicKey;
  systemProgramId?: PublicKey;
  programId?: PublicKey;
}

export function buildUpdateRolesInstruction(
  params: UpdateRolesInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(params.configPda, params.authority, programId)[0];
  const targetRoleAccountPda =
    params.targetRoleAccountPda ??
    findRoleAccountPda(params.configPda, params.target, programId)[0];

  const keys: AccountMeta[] = [
    { pubkey: params.authority, isSigner: true, isWritable: true },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
    { pubkey: targetRoleAccountPda, isSigner: false, isWritable: true },
    { pubkey: params.target, isSigner: false, isWritable: false },
    {
      pubkey: params.systemProgramId ?? SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
  ];

  const data = encodeUpdateRolesArgs(params.target, params.roles, params.mintQuota);
  return buildInstruction("update_roles", data, keys, programId);
}

export interface UpdateMinterInstructionParams {
  authority: PublicKey;
  configPda: PublicKey;
  targetRoleAccount: PublicKey;
  newQuota: Amount;
  roleAccountPda?: PublicKey;
  programId?: PublicKey;
}

export function buildUpdateMinterInstruction(
  params: UpdateMinterInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(params.configPda, params.authority, programId)[0];

  const keys: AccountMeta[] = [
    { pubkey: params.authority, isSigner: true, isWritable: false },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
    { pubkey: params.targetRoleAccount, isSigner: false, isWritable: true },
  ];

  const data = encodeUpdateMinterArgs(params.newQuota);
  return buildInstruction("update_minter", data, keys, programId);
}

export interface TransferAuthorityInstructionParams {
  currentAuthority: PublicKey;
  configPda: PublicKey;
  newAuthority: PublicKey;
  currentRoleAccount?: PublicKey;
  newRoleAccount?: PublicKey;
  systemProgramId?: PublicKey;
  programId?: PublicKey;
}

export function buildTransferAuthorityInstruction(
  params: TransferAuthorityInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const currentRoleAccount =
    params.currentRoleAccount ??
    findRoleAccountPda(params.configPda, params.currentAuthority, programId)[0];
  const newRoleAccount =
    params.newRoleAccount ??
    findRoleAccountPda(params.configPda, params.newAuthority, programId)[0];

  const keys: AccountMeta[] = [
    { pubkey: params.currentAuthority, isSigner: true, isWritable: true },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: currentRoleAccount, isSigner: false, isWritable: true },
    { pubkey: newRoleAccount, isSigner: false, isWritable: true },
    { pubkey: params.newAuthority, isSigner: false, isWritable: false },
    {
      pubkey: params.systemProgramId ?? SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
  ];

  return buildInstruction("transfer_authority", Buffer.alloc(0), keys, programId);
}

export interface AddToBlacklistInstructionParams {
  blacklister: PublicKey;
  configPda: PublicKey;
  wallet: PublicKey;
  reason: string;
  roleAccountPda?: PublicKey;
  blacklistEntryPda?: PublicKey;
  systemProgramId?: PublicKey;
  programId?: PublicKey;
}

export function buildAddToBlacklistInstruction(
  params: AddToBlacklistInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(params.configPda, params.blacklister, programId)[0];
  const blacklistEntryPda =
    params.blacklistEntryPda ??
    findBlacklistEntryPda(params.configPda, params.wallet, programId)[0];

  const keys: AccountMeta[] = [
    { pubkey: params.blacklister, isSigner: true, isWritable: true },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
    { pubkey: blacklistEntryPda, isSigner: false, isWritable: true },
    { pubkey: params.wallet, isSigner: false, isWritable: false },
    {
      pubkey: params.systemProgramId ?? SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
  ];

  const data = encodeAddToBlacklistArgs(params.wallet, params.reason);
  return buildInstruction("add_to_blacklist", data, keys, programId);
}

export interface RemoveFromBlacklistInstructionParams {
  blacklister: PublicKey;
  configPda: PublicKey;
  blacklistEntryPda: PublicKey;
  roleAccountPda?: PublicKey;
  programId?: PublicKey;
}

export function buildRemoveFromBlacklistInstruction(
  params: RemoveFromBlacklistInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(params.configPda, params.blacklister, programId)[0];

  const keys: AccountMeta[] = [
    { pubkey: params.blacklister, isSigner: true, isWritable: false },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
    { pubkey: params.blacklistEntryPda, isSigner: false, isWritable: true },
  ];

  return buildInstruction(
    "remove_from_blacklist",
    Buffer.alloc(0),
    keys,
    programId,
  );
}

export interface SeizeInstructionParams {
  seizer: PublicKey;
  configPda: PublicKey;
  mint: PublicKey;
  targetAta: PublicKey;
  treasuryAta: PublicKey;
  blacklistEntry: PublicKey;
  roleAccountPda?: PublicKey;
  token2022ProgramId?: PublicKey;
  programId?: PublicKey;
}

export function buildSeizeInstruction(
  params: SeizeInstructionParams,
): TransactionInstruction {
  const programId = params.programId ?? STABLECOIN_CORE_PROGRAM_ID;
  const roleAccountPda =
    params.roleAccountPda ??
    findRoleAccountPda(params.configPda, params.seizer, programId)[0];
  const token2022ProgramId = params.token2022ProgramId ?? TOKEN_2022_PROGRAM_ID;

  const keys: AccountMeta[] = [
    { pubkey: params.seizer, isSigner: true, isWritable: false },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: roleAccountPda, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.targetAta, isSigner: false, isWritable: true },
    { pubkey: params.treasuryAta, isSigner: false, isWritable: true },
    { pubkey: params.blacklistEntry, isSigner: false, isWritable: false },
    { pubkey: token2022ProgramId, isSigner: false, isWritable: false },
  ];

  return buildInstruction("seize", Buffer.alloc(0), keys, programId);
}
