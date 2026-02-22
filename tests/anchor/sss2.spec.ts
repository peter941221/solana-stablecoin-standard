import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";

describe("stablecoin-core sss-2", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StablecoinCore as Program;
  const authority = (provider.wallet as anchor.Wallet).payer;
  const transferHookProgramId = new PublicKey(
    "4A8pvyAMvPqypVh1gdgswu4YAsZfFDocQnWbvtnGP4bs",
  );

  const mintKeypair = Keypair.generate();
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin"), mintKeypair.publicKey.toBuffer()],
    program.programId,
  );
  const [rolePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("role"), configPda.toBuffer(), authority.publicKey.toBuffer()],
    program.programId,
  );
  const [extraMetasPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mintKeypair.publicKey.toBuffer()],
    transferHookProgramId,
  );

  it("initializes SSS-2, blacklists, and seizes", async () => {
    await program.methods
      .initialize({
        name: "Compliant USD",
        symbol: "CUSD",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: false,
        transferHookProgram: transferHookProgramId,
      })
      .accounts({
        authority: authority.publicKey,
        mint: mintKeypair.publicKey,
        config: configPda,
        roleAccount: rolePda,
        extraMetasAccount: extraMetasPda,
        transferHookProgram: transferHookProgramId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    const targetOwner = Keypair.generate();
    const targetAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      targetOwner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const amount = new anchor.BN(5_000_000);

    await program.methods
      .mint(amount)
      .accounts({
        minter: authority.publicKey,
        config: configPda,
        roleAccount: rolePda,
        mint: mintKeypair.publicKey,
        recipient: targetOwner.publicKey,
        recipientAta: targetAta,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .freezeAccount()
      .accounts({
        freezer: authority.publicKey,
        config: configPda,
        roleAccount: rolePda,
        mint: mintKeypair.publicKey,
        targetAta,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const [blacklistEntryPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        configPda.toBuffer(),
        targetOwner.publicKey.toBuffer(),
      ],
      program.programId,
    );

    await program.methods
      .addToBlacklist({
        wallet: targetOwner.publicKey,
        reason: "Test compliance",
      })
      .accounts({
        blacklister: authority.publicKey,
        config: configPda,
        roleAccount: rolePda,
        blacklistEntry: blacklistEntryPda,
        wallet: targetOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const treasuryAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const createTreasuryAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      treasuryAta,
      authority.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const treasuryTx = new anchor.web3.Transaction().add(createTreasuryAtaIx);
    await provider.sendAndConfirm(treasuryTx);

    await program.methods
      .seize()
      .accounts({
        seizer: authority.publicKey,
        config: configPda,
        roleAccount: rolePda,
        mint: mintKeypair.publicKey,
        targetAta,
        treasuryAta,
        blacklistEntry: blacklistEntryPda,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const treasuryAccount = await getAccount(
      provider.connection,
      treasuryAta,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    const targetAccount = await getAccount(
      provider.connection,
      targetAta,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );

    assert.equal(treasuryAccount.amount, BigInt(amount.toString()));
    assert.equal(targetAccount.amount, 0n);
  });
});
