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
  createTransferCheckedInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

import {
  buildBurnInstruction,
  buildFreezeInstruction,
  buildInitializeInstruction,
  buildMintInstruction,
  buildThawInstruction,
} from "../sdk/sss-token/src/instructions";
import {
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
): Promise<string> {
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
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }
  return signature;
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
    name: "DREX-SSS1",
    symbol: "DREX",
    uri: "",
    decimals: 6,
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
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
  const authorityAta = await ensureAta(
    connection,
    authority,
    mintKeypair.publicKey,
    authority.publicKey,
    commitment,
  );

  const mintToUserIx = buildMintInstruction({
    minter: authority.publicKey,
    mint: mintKeypair.publicKey,
    recipient: user1.publicKey,
    amount: 2_000_000n,
    configPda,
    recipientAta: user1Ata,
    programId,
  });

  const mintToAuthorityIx = buildMintInstruction({
    minter: authority.publicKey,
    mint: mintKeypair.publicKey,
    recipient: authority.publicKey,
    amount: 1_000_000n,
    configPda,
    recipientAta: authorityAta,
    programId,
  });

  const mintTx = await sendAndConfirm(
    connection,
    [mintToUserIx],
    [authority],
    commitment,
  );
  const mintAuthorityTx = await sendAndConfirm(
    connection,
    [mintToAuthorityIx],
    [authority],
    commitment,
  );

  const transferIx = createTransferCheckedInstruction(
    user1Ata,
    mintKeypair.publicKey,
    user2Ata,
    user1.publicKey,
    500_000n,
    6,
    [],
    TOKEN_2022_PROGRAM_ID,
  );

  const transferTx = await sendAndConfirm(
    connection,
    [transferIx],
    [authority, user1],
    commitment,
  );

  const freezeIx = buildFreezeInstruction({
    freezer: authority.publicKey,
    mint: mintKeypair.publicKey,
    targetAta: user2Ata,
    configPda,
    programId,
  });
  const freezeTx = await sendAndConfirm(
    connection,
    [freezeIx],
    [authority],
    commitment,
  );

  const thawIx = buildThawInstruction({
    freezer: authority.publicKey,
    mint: mintKeypair.publicKey,
    targetAta: user2Ata,
    configPda,
    programId,
  });
  const thawTx = await sendAndConfirm(
    connection,
    [thawIx],
    [authority],
    commitment,
  );

  const burnIx = buildBurnInstruction({
    burner: authority.publicKey,
    mint: mintKeypair.publicKey,
    burnerAta: authorityAta,
    amount: 200_000n,
    configPda,
    programId,
  });
  const burnTx = await sendAndConfirm(
    connection,
    [burnIx],
    [authority],
    commitment,
  );

  const proof = {
    cluster: "devnet",
    proofTag,
    programId: programId.toBase58(),
    mint: mintKeypair.publicKey.toBase58(),
    configPda: configPda.toBase58(),
    authority: authority.publicKey.toBase58(),
    user1: user1.publicKey.toBase58(),
    user2: user2.publicKey.toBase58(),
    signatures: {
      initialize: initializeTx,
      mint: mintTx,
      mintAuthority: mintAuthorityTx,
      transfer: transferTx,
      freeze: freezeTx,
      thaw: thawTx,
      burn: burnTx,
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
