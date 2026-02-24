import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedWithTransferHookInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";

import {
  buildAddToBlacklistInstruction,
  buildFreezeInstruction,
  buildInitializeInstruction,
  buildMintInstruction,
  buildRemoveFromBlacklistInstruction,
  buildSeizeInstruction,
} from "../sdk/sss-token/src/instructions";
import {
  findBlacklistEntryPda,
  findConfigPda,
  findRoleAccountPda,
  getAssociatedTokenAddress,
} from "../sdk/sss-token/src/utils";

type Commitment = "processed" | "confirmed" | "finalized";

const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function readSolanaConfigKeypairPath(): string | null {
  const configPath = path.join(os.homedir(), ".config", "solana", "cli", "config.yml");
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const contents = fs.readFileSync(configPath, "utf-8");
  const match = contents.match(/^keypair_path:\s*(.+)$/m);
  if (!match) {
    return null;
  }
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function resolveKeypairPath(): string {
  const envPath =
    process.env.AUTHORITY_KEYPAIR_PATH ??
    process.env.SOLANA_KEYPAIR_PATH ??
    process.env.SOLANA_WALLET;
  const fallbackPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const configPath = readSolanaConfigKeypairPath();
  const candidates = [envPath, configPath, fallbackPath].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  const keypairPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!keypairPath) {
    const candidateList = candidates.join(", ");
    throw new Error(
      `Keypair not found. Checked: ${candidateList}. Set AUTHORITY_KEYPAIR_PATH or copy your keypair to ${fallbackPath}.`,
    );
  }
  return keypairPath;
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(path, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function decodeBlacklistEntry(data: Buffer): {
  config: PublicKey;
  wallet: PublicKey;
  isActive: boolean;
  reason: string;
} | null {
  if (data.length < 8 + 32 + 32 + 8 + 32 + 4 + 2) {
    return null;
  }
  let offset = 8;
  const config = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const wallet = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  offset += 8;
  offset += 32;
  const reasonLength = data.readUInt32LE(offset);
  offset += 4;
  const reason = data.subarray(offset, offset + reasonLength).toString("utf8");
  offset += reasonLength;
  const isActive = data.readUInt8(offset) === 1;
  return { config, wallet, isActive, reason };
}

async function withRetry<T>(
  action: () => Promise<T>,
  label: string,
  attempts = 5,
  delayMs = 2000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${String(lastError)}`);
}

async function airdropIfNeeded(
  connection: Connection,
  pubkey: PublicKey,
  minLamports: number,
): Promise<void> {
  if (process.env.DISABLE_AIRDROP === "1") {
    return;
  }
  const balance = await withRetry(
    () => connection.getBalance(pubkey),
    "getBalance",
  );
  if (balance >= minLamports) {
    return;
  }
  const signature = await withRetry(
    () => connection.requestAirdrop(pubkey, minLamports - balance),
    "requestAirdrop",
  );
  const latestBlockhash = await withRetry(
    () => connection.getLatestBlockhash("confirmed"),
    "getLatestBlockhash",
  );
  await withRetry(
    () =>
      connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed",
      ),
    "confirmTransaction",
  );
}

async function sendAndConfirm(
  connection: Connection,
  instructions: Array<import("@solana/web3.js").TransactionInstruction>,
  signers: Keypair[],
  commitment: Commitment,
  allowFailure = false,
): Promise<{ signature: string; error: string | null }> {
  try {
    const latestBlockhash = await withRetry(
      () => connection.getLatestBlockhash(commitment),
      "getLatestBlockhash",
    );
    const tx = new Transaction({
      feePayer: signers[0].publicKey,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
    for (const instruction of instructions) {
      tx.add(instruction);
    }
    tx.sign(...signers);
    const signature = await withRetry(
      () => connection.sendRawTransaction(tx.serialize()),
      "sendRawTransaction",
    );
    const confirmation = await withRetry(
      () =>
        connection.confirmTransaction(
          {
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          commitment,
        ),
      "confirmTransaction",
    );
    const err = confirmation.value.err
      ? JSON.stringify(confirmation.value.err)
      : null;
    if (err && !allowFailure) {
      throw new Error(`Transaction failed: ${err}`);
    }
    return { signature, error: err };
  } catch (error) {
    if (allowFailure) {
      return { signature: "", error: String(error) };
    }
    throw error;
  }
}

async function fundIfNeeded(
  connection: Connection,
  payer: Keypair,
  recipient: PublicKey,
  minLamports: number,
  commitment: Commitment,
): Promise<void> {
  const balance = await withRetry(
    () => connection.getBalance(recipient),
    "getBalance",
  );
  if (balance >= minLamports) {
    return;
  }
  const ix = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: recipient,
    lamports: minLamports - balance,
  });
  await sendAndConfirm(connection, [ix], [payer], commitment);
}

async function ensureAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  commitment: Commitment,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddress(mint, owner, {
    tokenProgramId: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgramId: ASSOCIATED_TOKEN_PROGRAM_ID,
  });
  const accountInfo = await connection.getAccountInfo(ata, commitment);
  if (!accountInfo) {
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    await sendAndConfirm(connection, [ix], [payer], commitment);
  }
  return ata;
}

async function main(): Promise<void> {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL;
  const commitment = (process.env.SOLANA_COMMITMENT ?? "confirmed") as Commitment;
  const programId = new PublicKey(requireEnv("SSS_CORE_PROGRAM_ID"));
  const transferHookProgramId = new PublicKey(requireEnv("SSS_TRANSFER_HOOK_PROGRAM_ID"));
  const proofTag = process.env.PROOF_TAG;

  const authorityPath = resolveKeypairPath();
  const authority = loadKeypair(authorityPath);

  const connection = new Connection(rpcUrl, commitment);

  const user1 = Keypair.generate();
  const user2 = Keypair.generate();

  await airdropIfNeeded(connection, authority.publicKey, 2 * LAMPORTS_PER_SOL);
  const minUserLamports =
    process.env.DISABLE_AIRDROP === "1" ? 0 : LAMPORTS_PER_SOL / 5;
  await fundIfNeeded(connection, authority, user1.publicKey, minUserLamports, commitment);
  await fundIfNeeded(connection, authority, user2.publicKey, minUserLamports, commitment);

  const mintKeypair = Keypair.generate();
  const configPda = findConfigPda(mintKeypair.publicKey, programId)[0];
  const rolePda = findRoleAccountPda(configPda, authority.publicKey, programId)[0];

  const initIx = buildInitializeInstruction({
    authority: authority.publicKey,
    mint: mintKeypair.publicKey,
    name: "DREX-SSS2",
    symbol: "DREX",
    uri: "",
    decimals: 6,
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
    transferHookProgramId,
    configPda,
    roleAccountPda: rolePda,
    programId,
  });

  const initializeTx = await sendAndConfirm(
    connection,
    [initIx],
    [authority, mintKeypair],
    commitment,
  );

  const user1Ata = await ensureAta(
    connection,
    authority,
    mintKeypair.publicKey,
    user1.publicKey,
    commitment,
  );
  const user2Ata = await ensureAta(
    connection,
    authority,
    mintKeypair.publicKey,
    user2.publicKey,
    commitment,
  );
  const treasuryAta = await ensureAta(
    connection,
    authority,
    mintKeypair.publicKey,
    authority.publicKey,
    commitment,
  );

  const mintIx = buildMintInstruction({
    minter: authority.publicKey,
    mint: mintKeypair.publicKey,
    recipient: user1.publicKey,
    amount: 2_000_000n,
    configPda,
    recipientAta: user1Ata,
    programId,
  });

  const mintTx = await sendAndConfirm(
    connection,
    [mintIx],
    [authority],
    commitment,
  );

  const bootstrapUser1BlacklistIx = buildAddToBlacklistInstruction({
    blacklister: authority.publicKey,
    configPda,
    wallet: user1.publicKey,
    reason: "bootstrap",
    blacklistEntryPda: findBlacklistEntryPda(configPda, user1.publicKey, programId)[0],
    roleAccountPda: rolePda,
    programId,
  });
  const bootstrapUser1UnblockIx = buildRemoveFromBlacklistInstruction({
    blacklister: authority.publicKey,
    configPda,
    blacklistEntryPda: findBlacklistEntryPda(configPda, user1.publicKey, programId)[0],
    roleAccountPda: rolePda,
    programId,
  });
  await sendAndConfirm(
    connection,
    [bootstrapUser1BlacklistIx, bootstrapUser1UnblockIx],
    [authority],
    commitment,
  );

  const bootstrapUser2BlacklistIx = buildAddToBlacklistInstruction({
    blacklister: authority.publicKey,
    configPda,
    wallet: user2.publicKey,
    reason: "bootstrap",
    blacklistEntryPda: findBlacklistEntryPda(configPda, user2.publicKey, programId)[0],
    roleAccountPda: rolePda,
    programId,
  });
  const bootstrapUser2UnblockIx = buildRemoveFromBlacklistInstruction({
    blacklister: authority.publicKey,
    configPda,
    blacklistEntryPda: findBlacklistEntryPda(configPda, user2.publicKey, programId)[0],
    roleAccountPda: rolePda,
    programId,
  });
  await sendAndConfirm(
    connection,
    [bootstrapUser2BlacklistIx, bootstrapUser2UnblockIx],
    [authority],
    commitment,
  );

  const authorityBlacklistEntryPda = findBlacklistEntryPda(
    configPda,
    authority.publicKey,
    programId,
  )[0];
  const bootstrapAuthorityBlacklistIx = buildAddToBlacklistInstruction({
    blacklister: authority.publicKey,
    configPda,
    wallet: authority.publicKey,
    reason: "bootstrap",
    blacklistEntryPda: authorityBlacklistEntryPda,
    roleAccountPda: rolePda,
    programId,
  });
  const bootstrapAuthorityUnblockIx = buildRemoveFromBlacklistInstruction({
    blacklister: authority.publicKey,
    configPda,
    blacklistEntryPda: authorityBlacklistEntryPda,
    roleAccountPda: rolePda,
    programId,
  });
  await sendAndConfirm(
    connection,
    [bootstrapAuthorityBlacklistIx, bootstrapAuthorityUnblockIx],
    [authority],
    commitment,
  );

  const sourceBlacklistEntryPda = findBlacklistEntryPda(
    configPda,
    user1.publicKey,
    programId,
  )[0];
  const destinationBlacklistEntryPda = findBlacklistEntryPda(
    configPda,
    user2.publicKey,
    programId,
  )[0];
  if (process.env.DEBUG_BLACKLIST === "1") {
    const user1Account = await withRetry(
      () => getAccount(connection, user1Ata, commitment, TOKEN_2022_PROGRAM_ID),
      "getAccount",
    );
    const user2Account = await withRetry(
      () => getAccount(connection, user2Ata, commitment, TOKEN_2022_PROGRAM_ID),
      "getAccount",
    );
    const [sourceInfo, destinationInfo] = await Promise.all([
      withRetry(
        () => connection.getAccountInfo(sourceBlacklistEntryPda, commitment),
        "getAccountInfo",
      ),
      withRetry(
        () => connection.getAccountInfo(destinationBlacklistEntryPda, commitment),
        "getAccountInfo",
      ),
    ]);
    console.log(
      JSON.stringify(
        {
          user1Owner: user1Account.owner.toBase58(),
          user2Owner: user2Account.owner.toBase58(),
          sourceBlacklist: sourceInfo
            ? decodeBlacklistEntry(sourceInfo.data)
            : null,
          destinationBlacklist: destinationInfo
            ? decodeBlacklistEntry(destinationInfo.data)
            : null,
        },
        null,
        2,
      ),
    );
  }

  const transferIx = await withRetry(
    () =>
      createTransferCheckedWithTransferHookInstruction(
        connection,
        user1Ata,
        mintKeypair.publicKey,
        user2Ata,
        user1.publicKey,
        500_000n,
        6,
        [],
        commitment,
        TOKEN_2022_PROGRAM_ID,
      ),
    "buildTransferHookInstruction",
  );

  const transferTx = await sendAndConfirm(
    connection,
    [transferIx],
    [authority, user1],
    commitment,
    true,
  );

  const blacklistEntryPda = findBlacklistEntryPda(configPda, user1.publicKey, programId)[0];
  const blacklistIx = buildAddToBlacklistInstruction({
    blacklister: authority.publicKey,
    configPda,
    wallet: user1.publicKey,
    reason: "smoke-test",
    blacklistEntryPda,
    programId,
  });

  const blacklistTx = await sendAndConfirm(
    connection,
    [blacklistIx],
    [authority],
    commitment,
  );

  const blockedTransferIx = await withRetry(
    () =>
      createTransferCheckedWithTransferHookInstruction(
        connection,
        user1Ata,
        mintKeypair.publicKey,
        user2Ata,
        user1.publicKey,
        100_000n,
        6,
        [],
        commitment,
        TOKEN_2022_PROGRAM_ID,
      ),
    "buildTransferHookInstruction",
  );

  const blockedTransfer = await sendAndConfirm(
    connection,
    [blockedTransferIx],
    [authority, user1],
    commitment,
    true,
  );

  const freezeIx = buildFreezeInstruction({
    freezer: authority.publicKey,
    mint: mintKeypair.publicKey,
    targetAta: user1Ata,
    configPda,
    programId,
  });
  const freezeTx = await sendAndConfirm(
    connection,
    [freezeIx],
    [authority],
    commitment,
  );

  const seizeIx = buildSeizeInstruction({
    seizer: authority.publicKey,
    configPda,
    mint: mintKeypair.publicKey,
    targetAta: user1Ata,
    treasuryAta,
    blacklistEntry: blacklistEntryPda,
    destinationBlacklistEntry: authorityBlacklistEntryPda,
    transferHookProgramId,
    programId,
  });
  const seizeTx = await sendAndConfirm(
    connection,
    [seizeIx],
    [authority],
    commitment,
  );

  const proof = {
    cluster: "devnet",
    proofTag,
    programId: programId.toBase58(),
    transferHookProgramId: transferHookProgramId.toBase58(),
    mint: mintKeypair.publicKey.toBase58(),
    configPda: configPda.toBase58(),
    authority: authority.publicKey.toBase58(),
    user1: user1.publicKey.toBase58(),
    user2: user2.publicKey.toBase58(),
    signatures: {
      initialize: initializeTx.signature,
      mint: mintTx.signature,
      transfer: transferTx.signature,
      transferError: transferTx.error,
      blacklist: blacklistTx.signature,
      blockedTransfer: blockedTransfer.signature,
      blockedTransferError: blockedTransfer.error,
      freeze: freezeTx.signature,
      seize: seizeTx.signature,
    },
  };

  console.log(JSON.stringify(proof, null, 2));

  if (process.env.PROOF_PATH) {
    fs.writeFileSync(process.env.PROOF_PATH, JSON.stringify(proof, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
