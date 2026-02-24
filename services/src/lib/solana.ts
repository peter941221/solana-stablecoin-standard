import { createHash } from "crypto";
import fs from "fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export interface StablecoinFeatureFlags {
  permanentDelegate: boolean;
  transferHook: boolean;
  confidential: boolean;
  defaultFrozen: boolean;
}

export interface StablecoinConfigData {
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
  features: StablecoinFeatureFlags;
  transferHookProgram: PublicKey | null;
  bump: number;
}

export interface BlacklistEntryData {
  wallet: PublicKey;
  reason: string | null;
  isActive: boolean;
}

export interface SolanaClientConfig {
  connection: Connection;
  programId: PublicKey;
  mint: PublicKey;
  authority: Keypair;
}

export class StablecoinClient {
  private readonly connection: Connection;
  private readonly programId: PublicKey;
  private readonly mint: PublicKey;
  private readonly authority: Keypair;

  constructor(config: SolanaClientConfig) {
    this.connection = config.connection;
    this.programId = config.programId;
    this.mint = config.mint;
    this.authority = config.authority;
  }

  async mintTokens(recipient: PublicKey, amount: bigint): Promise<string> {
    const configPda = findConfigPda(this.mint, this.programId)[0];
    const rolePda = findRolePda(configPda, this.authority.publicKey, this.programId)[0];
    const recipientAta = getAssociatedTokenAddressSync(
      this.mint,
      recipient,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const instruction = buildMintInstruction({
      minter: this.authority.publicKey,
      mint: this.mint,
      recipient,
      recipientAta,
      amount,
      configPda,
      rolePda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [this.authority]);
  }

  async burnTokens(amount: bigint): Promise<string> {
    const configPda = findConfigPda(this.mint, this.programId)[0];
    const rolePda = findRolePda(configPda, this.authority.publicKey, this.programId)[0];
    const burnerAta = getAssociatedTokenAddressSync(
      this.mint,
      this.authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const instruction = buildBurnInstruction({
      burner: this.authority.publicKey,
      mint: this.mint,
      burnerAta,
      amount,
      configPda,
      rolePda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [this.authority]);
  }

  async freezeAccount(targetAta: PublicKey): Promise<string> {
    const configPda = findConfigPda(this.mint, this.programId)[0];
    const rolePda = findRolePda(configPda, this.authority.publicKey, this.programId)[0];
    const instruction = buildFreezeInstruction({
      freezer: this.authority.publicKey,
      mint: this.mint,
      targetAta,
      configPda,
      rolePda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [this.authority]);
  }

  async thawAccount(targetAta: PublicKey): Promise<string> {
    const configPda = findConfigPda(this.mint, this.programId)[0];
    const rolePda = findRolePda(configPda, this.authority.publicKey, this.programId)[0];
    const instruction = buildThawInstruction({
      freezer: this.authority.publicKey,
      mint: this.mint,
      targetAta,
      configPda,
      rolePda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [this.authority]);
  }

  async pauseSystem(): Promise<string> {
    const configPda = findConfigPda(this.mint, this.programId)[0];
    const rolePda = findRolePda(configPda, this.authority.publicKey, this.programId)[0];
    const instruction = buildPauseInstruction({
      pauser: this.authority.publicKey,
      configPda,
      rolePda,
      unpause: false,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [this.authority]);
  }

  async unpauseSystem(): Promise<string> {
    const configPda = findConfigPda(this.mint, this.programId)[0];
    const rolePda = findRolePda(configPda, this.authority.publicKey, this.programId)[0];
    const instruction = buildPauseInstruction({
      pauser: this.authority.publicKey,
      configPda,
      rolePda,
      unpause: true,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [this.authority]);
  }

  async addToBlacklist(wallet: PublicKey, reason: string): Promise<string> {
    const configPda = findConfigPda(this.mint, this.programId)[0];
    const rolePda = findRolePda(configPda, this.authority.publicKey, this.programId)[0];
    const blacklistPda = findBlacklistPda(configPda, wallet, this.programId)[0];
    const instruction = buildAddToBlacklistInstruction({
      blacklister: this.authority.publicKey,
      configPda,
      rolePda,
      blacklistPda,
      wallet,
      reason,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [this.authority]);
  }

  async removeFromBlacklist(wallet: PublicKey): Promise<string> {
    const configPda = findConfigPda(this.mint, this.programId)[0];
    const rolePda = findRolePda(configPda, this.authority.publicKey, this.programId)[0];
    const blacklistPda = findBlacklistPda(configPda, wallet, this.programId)[0];
    const instruction = buildRemoveFromBlacklistInstruction({
      blacklister: this.authority.publicKey,
      configPda,
      rolePda,
      blacklistPda,
      programId: this.programId,
    });
    return sendInstructions(this.connection, [instruction], [this.authority]);
  }

  async getConfig(): Promise<StablecoinConfigData> {
    const configPda = findConfigPda(this.mint, this.programId)[0];
    const account = await this.connection.getAccountInfo(configPda);
    if (!account) {
      throw new Error("Stablecoin config not found");
    }
    return decodeStablecoinConfig(account.data);
  }

  async getSupply(): Promise<{ amount: string; decimals: number }>
  {
    const supply = await this.connection.getTokenSupply(this.mint);
    return {
      amount: supply.value.amount,
      decimals: supply.value.decimals,
    };
  }

  async getBlacklistedAddresses(): Promise<BlacklistEntryData[]> {
    const configPda = findConfigPda(this.mint, this.programId)[0];
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        {
          memcmp: {
            offset: 8,
            bytes: configPda.toBase58(),
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
        entries.push(decoded);
      } catch {
        continue;
      }
    }
    return entries;
  }
}

export function loadKeypair(path: string): Keypair {
  const content = fs.readFileSync(path, "utf-8");
  const raw = JSON.parse(content) as number[];
  return Keypair.fromSecretKey(new Uint8Array(raw));
}

export function parsePublicKey(value: string): PublicKey {
  return new PublicKey(value);
}

export function parseAmount(value: string | number): bigint {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Amount is invalid");
    }
    if (!Number.isInteger(value)) {
      throw new Error("Amount must be an integer");
    }
    if (value < 0) {
      throw new Error("Amount must be positive");
    }
    return BigInt(value);
  }
  const normalized = value.trim().replace(/_/g, "");
  if (normalized.includes(".")) {
    throw new Error("Amount must be an integer in base units");
  }
  const parsed = BigInt(normalized);
  if (parsed < 0n) {
    throw new Error("Amount must be positive");
  }
  return parsed;
}

export function findConfigPda(mint: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("stablecoin"), mint.toBuffer()], programId);
}

export function findRolePda(
  config: PublicKey,
  authority: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role"), config.toBuffer(), authority.toBuffer()],
    programId,
  );
}

export function findBlacklistPda(
  config: PublicKey,
  wallet: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), config.toBuffer(), wallet.toBuffer()],
    programId,
  );
}

function sendInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[],
): Promise<string> {
  if (instructions.length === 0) {
    throw new Error("No instructions provided");
  }
  return connection.getLatestBlockhash().then((blockhash) => {
    const transaction = new Transaction({
      feePayer: signers[0].publicKey,
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    });
    for (const instruction of instructions) {
      transaction.add(instruction);
    }
    transaction.sign(...signers);
    return connection
      .sendRawTransaction(transaction.serialize())
      .then(async (signature) => {
        await connection.confirmTransaction({
          signature,
          blockhash: blockhash.blockhash,
          lastValidBlockHeight: blockhash.lastValidBlockHeight,
        });
        return signature;
      });
  });
}

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

  writeU64(value: bigint | number): void {
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

  writeOption<T>(value: T | null | undefined, writer: (input: T) => void): void {
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

function accountDiscriminator(name: string): Buffer {
  return createHash("sha256")
    .update(`account:${name}`)
    .digest()
    .subarray(0, 8);
}

function decodeAccountData<T>(
  data: Buffer,
  discriminatorName: string,
  decode: (reader: BorshReader) => T,
): T {
  if (data.length < 8) {
    throw new Error("Account data too small");
  }
  const expected = accountDiscriminator(discriminatorName);
  const actual = data.subarray(0, 8);
  if (!actual.equals(expected)) {
    throw new Error("Account discriminator mismatch");
  }
  const reader = new BorshReader(data.subarray(8));
  return decode(reader);
}

export function decodeStablecoinConfig(data: Buffer): StablecoinConfigData {
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
    const features = {
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

export function decodeBlacklistEntry(data: Buffer): BlacklistEntryData {
  return decodeAccountData(data, "BlacklistEntry", (reader) => {
    reader.readPubkey();
    const wallet = reader.readPubkey();
    reader.readI64();
    reader.readPubkey();
    const reason = reader.readString();
    const isActive = reader.readBool();
    reader.readU8();
    return {
      wallet,
      reason: reason.length > 0 ? reason : null,
      isActive,
    };
  });
}

function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

function buildInstruction(
  name: string,
  data: Buffer,
  keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>,
  programId: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.concat([anchorDiscriminator(name), data]),
  });
}

function encodeMintBurnArgs(amount: bigint): Buffer {
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

function buildMintInstruction(params: {
  minter: PublicKey;
  mint: PublicKey;
  recipient: PublicKey;
  recipientAta: PublicKey;
  amount: bigint;
  configPda: PublicKey;
  rolePda: PublicKey;
  programId: PublicKey;
}): TransactionInstruction {
  const keys = [
    { pubkey: params.minter, isSigner: true, isWritable: true },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: params.rolePda, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: true },
    { pubkey: params.recipient, isSigner: false, isWritable: false },
    { pubkey: params.recipientAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return buildInstruction("mint", encodeMintBurnArgs(params.amount), keys, params.programId);
}

function buildBurnInstruction(params: {
  burner: PublicKey;
  mint: PublicKey;
  burnerAta: PublicKey;
  amount: bigint;
  configPda: PublicKey;
  rolePda: PublicKey;
  programId: PublicKey;
}): TransactionInstruction {
  const keys = [
    { pubkey: params.burner, isSigner: true, isWritable: true },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: params.rolePda, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: true },
    { pubkey: params.burnerAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return buildInstruction("burn", encodeMintBurnArgs(params.amount), keys, params.programId);
}

function buildFreezeInstruction(params: {
  freezer: PublicKey;
  mint: PublicKey;
  targetAta: PublicKey;
  configPda: PublicKey;
  rolePda: PublicKey;
  programId: PublicKey;
}): TransactionInstruction {
  const keys = [
    { pubkey: params.freezer, isSigner: true, isWritable: false },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: params.rolePda, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.targetAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return buildInstruction("freeze_account", Buffer.alloc(0), keys, params.programId);
}

function buildThawInstruction(params: {
  freezer: PublicKey;
  mint: PublicKey;
  targetAta: PublicKey;
  configPda: PublicKey;
  rolePda: PublicKey;
  programId: PublicKey;
}): TransactionInstruction {
  const keys = [
    { pubkey: params.freezer, isSigner: true, isWritable: false },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: params.rolePda, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: params.targetAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return buildInstruction("thaw_account", Buffer.alloc(0), keys, params.programId);
}

function buildPauseInstruction(params: {
  pauser: PublicKey;
  configPda: PublicKey;
  rolePda: PublicKey;
  unpause: boolean;
  programId: PublicKey;
}): TransactionInstruction {
  const keys = [
    { pubkey: params.pauser, isSigner: true, isWritable: false },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: params.rolePda, isSigner: false, isWritable: true },
  ];
  return buildInstruction(
    params.unpause ? "unpause" : "pause",
    Buffer.alloc(0),
    keys,
    params.programId,
  );
}

function buildAddToBlacklistInstruction(params: {
  blacklister: PublicKey;
  configPda: PublicKey;
  rolePda: PublicKey;
  blacklistPda: PublicKey;
  wallet: PublicKey;
  reason: string;
  programId: PublicKey;
}): TransactionInstruction {
  const keys = [
    { pubkey: params.blacklister, isSigner: true, isWritable: true },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: params.rolePda, isSigner: false, isWritable: true },
    { pubkey: params.blacklistPda, isSigner: false, isWritable: true },
    { pubkey: params.wallet, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return buildInstruction(
    "add_to_blacklist",
    encodeAddToBlacklistArgs(params.wallet, params.reason),
    keys,
    params.programId,
  );
}

function buildRemoveFromBlacklistInstruction(params: {
  blacklister: PublicKey;
  configPda: PublicKey;
  rolePda: PublicKey;
  blacklistPda: PublicKey;
  programId: PublicKey;
}): TransactionInstruction {
  const keys = [
    { pubkey: params.blacklister, isSigner: true, isWritable: false },
    { pubkey: params.configPda, isSigner: false, isWritable: true },
    { pubkey: params.rolePda, isSigner: false, isWritable: true },
    { pubkey: params.blacklistPda, isSigner: false, isWritable: true },
  ];
  return buildInstruction(
    "remove_from_blacklist",
    Buffer.alloc(0),
    keys,
    params.programId,
  );
}
