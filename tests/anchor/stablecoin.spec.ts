import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";

describe("stablecoin-core", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StablecoinCore as Program;
  const authority = (provider.wallet as anchor.Wallet).payer;

  const mintKeypair = Keypair.generate();
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin"), mintKeypair.publicKey.toBuffer()],
    program.programId,
  );
  const [rolePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("role"), configPda.toBuffer(), authority.publicKey.toBuffer()],
    program.programId,
  );

  it("initializes SSS-1 config", async () => {
    await program.methods
      .initialize({
        name: "Test USD",
        symbol: "TUSD",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
        transferHookProgram: null,
      })
      .accounts({
        authority: authority.publicKey,
        mint: mintKeypair.publicKey,
        config: configPda,
        roleAccount: rolePda,
        extraMetasAccount: null,
        transferHookProgram: null,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    assert.ok(config.mint.equals(mintKeypair.publicKey));
    assert.equal(config.symbol, "TUSD");
    assert.equal(config.decimals, 6);
    assert.equal(config.isPaused, false);
    assert.equal(config.features.transferHook, false);
  });

  it("mints tokens to recipient", async () => {
    const recipient = Keypair.generate();
    const recipientAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const amount = new anchor.BN(1_000_000);

    await program.methods
      .mint(amount)
      .accounts({
        minter: authority.publicKey,
        config: configPda,
        roleAccount: rolePda,
        mint: mintKeypair.publicKey,
        recipient: recipient.publicKey,
        recipientAta,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const account = await getAccount(
      provider.connection,
      recipientAta,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    assert.equal(account.amount, BigInt(amount.toString()));

    const config = await program.account.stablecoinConfig.fetch(configPda);
    assert.equal(config.totalMinted.toString(), amount.toString());
  });
});
