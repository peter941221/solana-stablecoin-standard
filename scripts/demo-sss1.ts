import fs from "node:fs";

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
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

function resolveKeypairPath(): string {
  const fallbackHome = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return process.env.AUTHORITY_KEYPAIR_PATH ?? `${fallbackHome}/.config/solana/id.json`;
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(path, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function airdropIfNeeded(
  connection: Connection,
  pubkey: PublicKey,
  minLamports: number,
): Promise<void> {
  const balance = await connection.getBalance(pubkey);
  if (balance >= minLamports) {
    return;
  }
  const signature = await connection.requestAirdrop(pubkey, minLamports - balance);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed",
  );
}

async function sendAndConfirm(
  connection: Connection,
  instructions: Array<import("@solana/web3.js").TransactionInstruction>,
  signers: Keypair[],
  commitment: Commitment,
): Promise<string> {
  const latestBlockhash = await connection.getLatestBlockhash(commitment);
  const tx = new Transaction({
    feePayer: signers[0].publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
  for (const instruction of instructions) {
    tx.add(instruction);
  }
  tx.sign(...signers);
  const signature = await connection.sendRawTransaction(tx.serialize());
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment,
  );
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }
  return signature;
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

  const authorityPath = resolveKeypairPath();
  const authority = loadKeypair(authorityPath);

  const connection = new Connection(rpcUrl, commitment);

  const user1 = Keypair.generate();
  const user2 = Keypair.generate();

  await airdropIfNeeded(connection, authority.publicKey, 2 * LAMPORTS_PER_SOL);
  await airdropIfNeeded(connection, user1.publicKey, 1 * LAMPORTS_PER_SOL);
  await airdropIfNeeded(connection, user2.publicKey, 1 * LAMPORTS_PER_SOL);

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

  const mintToUserIx = buildMintInstruction({
    minter: authority.publicKey,
    mint: mintKeypair.publicKey,
    recipient: user1.publicKey,
    amount: 2_000_000n,
    configPda,
    programId,
  });

  const mintToAuthorityIx = buildMintInstruction({
    minter: authority.publicKey,
    mint: mintKeypair.publicKey,
    recipient: authority.publicKey,
    amount: 1_000_000n,
    configPda,
    programId,
  });

  const mintTx = await sendAndConfirm(
    connection,
    [mintToUserIx, mintToAuthorityIx],
    [authority],
    commitment,
  );

  const user1Ata = await ensureAta(connection, authority, mintKeypair.publicKey, user1.publicKey, commitment);
  const user2Ata = await ensureAta(connection, authority, mintKeypair.publicKey, user2.publicKey, commitment);

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
    [user1],
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

  const authorityAta = getAssociatedTokenAddress(mintKeypair.publicKey, authority.publicKey, {
    tokenProgramId: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgramId: ASSOCIATED_TOKEN_PROGRAM_ID,
  });

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
    programId: programId.toBase58(),
    mint: mintKeypair.publicKey.toBase58(),
    configPda: configPda.toBase58(),
    authority: authority.publicKey.toBase58(),
    user1: user1.publicKey.toBase58(),
    user2: user2.publicKey.toBase58(),
    signatures: {
      initialize: initializeTx,
      mint: mintTx,
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
