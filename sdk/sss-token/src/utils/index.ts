import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  type Commitment,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID as ASSOCIATED_TOKEN_PROGRAM_ID_VALUE,
  TOKEN_2022_PROGRAM_ID as TOKEN_2022_PROGRAM_ID_VALUE,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const STABLECOIN_CORE_PROGRAM_ID = new PublicKey(
  "5T8qkjgJVWcUVza36JVFq3GCiKwAXhunKc8NY2nNbtiZ",
);
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "5gVGKwPB7qstEN5Kp8fJGCURGPGz2GQnYHQAtD1zKSLB",
);

export const TOKEN_2022_PROGRAM_ID = TOKEN_2022_PROGRAM_ID_VALUE;
export const ASSOCIATED_TOKEN_PROGRAM_ID = ASSOCIATED_TOKEN_PROGRAM_ID_VALUE;
export const SYSTEM_PROGRAM_ID = SystemProgram.programId;
export const RENT_SYSVAR_ID = SYSVAR_RENT_PUBKEY;

const CONFIG_SEED = Buffer.from("stablecoin");
const ROLE_SEED = Buffer.from("role");
const BLACKLIST_SEED = Buffer.from("blacklist");
const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

export function findConfigPda(
  mint: PublicKey,
  programId: PublicKey = STABLECOIN_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    programId,
  );
}

export function findRoleAccountPda(
  config: PublicKey,
  authority: PublicKey,
  programId: PublicKey = STABLECOIN_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, config.toBuffer(), authority.toBuffer()],
    programId,
  );
}

export function findBlacklistEntryPda(
  config: PublicKey,
  wallet: PublicKey,
  programId: PublicKey = STABLECOIN_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, config.toBuffer(), wallet.toBuffer()],
    programId,
  );
}

export function findExtraAccountMetasPda(
  mint: PublicKey,
  transferHookProgramId: PublicKey = TRANSFER_HOOK_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    transferHookProgramId,
  );
}

export function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  options?: {
    allowOwnerOffCurve?: boolean;
    tokenProgramId?: PublicKey;
    associatedTokenProgramId?: PublicKey;
  },
): PublicKey {
  const allowOwnerOffCurve = options?.allowOwnerOffCurve ?? false;
  const tokenProgramId = options?.tokenProgramId ?? TOKEN_2022_PROGRAM_ID_VALUE;
  const associatedTokenProgramId =
    options?.associatedTokenProgramId ?? ASSOCIATED_TOKEN_PROGRAM_ID_VALUE;

  return getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve,
    associatedTokenProgramId,
    tokenProgramId,
  );
}

const ACCOUNT_DISCRIMINATOR_LENGTH = 8;

function accountDiscriminator(name: string): Buffer {
  const preimage = `account:${name}`;
  return createHash("sha256").update(preimage).digest().subarray(0, 8);
}

class BorshReader {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  readU8(): number {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readBool(): boolean {
    return this.readU8() !== 0;
  }

  readU32(): number {
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readU64(): bigint {
    const value = this.buffer.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  readI64(): number {
    const value = this.buffer.readBigInt64LE(this.offset);
    this.offset += 8;
    return Number(value);
  }

  readString(): string {
    const length = this.readU32();
    const slice = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice.toString("utf8");
  }

  readPubkey(): PublicKey {
    const slice = this.buffer.subarray(this.offset, this.offset + 32);
    this.offset += 32;
    return new PublicKey(slice);
  }

  readOption<T>(reader: () => T): T | null {
    const tag = this.readU8();
    if (tag === 0) {
      return null;
    }
    return reader();
  }
}

function decodeAccountData<T>(
  data: Buffer,
  discriminatorName: string,
  decode: (reader: BorshReader) => T,
): T {
  if (data.length < ACCOUNT_DISCRIMINATOR_LENGTH) {
    throw new Error("Account data too small");
  }
  const expected = accountDiscriminator(discriminatorName);
  const actual = data.subarray(0, ACCOUNT_DISCRIMINATOR_LENGTH);
  if (!actual.equals(expected)) {
    throw new Error("Account discriminator mismatch");
  }
  const reader = new BorshReader(data.subarray(ACCOUNT_DISCRIMINATOR_LENGTH));
  return decode(reader);
}

export interface FeatureFlagsData {
  permanentDelegate: boolean;
  transferHook: boolean;
  confidential: boolean;
  defaultFrozen: boolean;
}

export interface StablecoinConfigAccountData {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  isPaused: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
  auditCounter: bigint;
  features: FeatureFlagsData;
  transferHookProgram: PublicKey | null;
  bump: number;
}

export interface RoleAccountDataInternal {
  config: PublicKey;
  authority: PublicKey;
  roles: number;
  mintQuota: bigint | null;
  mintedCurrentWindow: bigint;
  windowStart: number;
  bump: number;
}

export interface BlacklistEntryDataInternal {
  config: PublicKey;
  wallet: PublicKey;
  blacklistedAt: number;
  blacklistedBy: PublicKey;
  reason: string;
  isActive: boolean;
  bump: number;
}

export function decodeStablecoinConfig(data: Buffer): StablecoinConfigAccountData {
  return decodeAccountData(data, "StablecoinConfig", (reader) => {
    const authority = reader.readPubkey();
    const mint = reader.readPubkey();
    const name = reader.readString();
    const symbol = reader.readString();
    const uri = reader.readString();
    const decimals = reader.readU8();
    const isPaused = reader.readBool();
    const totalMinted = reader.readU64();
    const totalBurned = reader.readU64();
    const auditCounter = reader.readU64();
    const features: FeatureFlagsData = {
      permanentDelegate: reader.readBool(),
      transferHook: reader.readBool(),
      confidential: reader.readBool(),
      defaultFrozen: reader.readBool(),
    };
    const transferHookProgram = reader.readOption(() => reader.readPubkey());
    const bump = reader.readU8();
    return {
      authority,
      mint,
      name,
      symbol,
      uri,
      decimals,
      isPaused,
      totalMinted,
      totalBurned,
      auditCounter,
      features,
      transferHookProgram,
      bump,
    };
  });
}

export function decodeRoleAccount(data: Buffer): RoleAccountDataInternal {
  return decodeAccountData(data, "RoleAccount", (reader) => {
    const config = reader.readPubkey();
    const authority = reader.readPubkey();
    const roles = reader.readU8();
    const mintQuota = reader.readOption(() => reader.readU64());
    const mintedCurrentWindow = reader.readU64();
    const windowStart = reader.readI64();
    const bump = reader.readU8();
    return {
      config,
      authority,
      roles,
      mintQuota,
      mintedCurrentWindow,
      windowStart,
      bump,
    };
  });
}

export function decodeBlacklistEntry(data: Buffer): BlacklistEntryDataInternal {
  return decodeAccountData(data, "BlacklistEntry", (reader) => {
    const config = reader.readPubkey();
    const wallet = reader.readPubkey();
    const blacklistedAt = reader.readI64();
    const blacklistedBy = reader.readPubkey();
    const reason = reader.readString();
    const isActive = reader.readBool();
    const bump = reader.readU8();
    return {
      config,
      wallet,
      blacklistedAt,
      blacklistedBy,
      reason,
      isActive,
      bump,
    };
  });
}

export interface SendInstructionsOptions {
  feePayer?: PublicKey;
  commitment?: Commitment;
  skipPreflight?: boolean;
}

export async function sendInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[],
  options?: SendInstructionsOptions,
): Promise<string> {
  if (instructions.length === 0) {
    throw new Error("No instructions provided");
  }
  if (signers.length === 0 && !options?.feePayer) {
    throw new Error("No signers or fee payer provided");
  }

  const latestBlockhash = await connection.getLatestBlockhash();
  const feePayer = options?.feePayer ?? signers[0].publicKey;
  const transaction = new Transaction({
    feePayer,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
  for (const instruction of instructions) {
    transaction.add(instruction);
  }

  if (signers.length > 0) {
    transaction.sign(...signers);
  }

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: options?.skipPreflight,
  });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    options?.commitment,
  );
  return signature;
}
