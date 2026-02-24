# CLI

## Overview

The CLI wraps stablecoin-core instructions for day-to-day operations.

Binary name

  sss-token

## Global Options

- --cluster devnet|testnet|mainnet|localnet|URL

- --keypair /path/to/keypair.json

- --output text|json

## Common Commands

Initialize

  sss-token init --preset sss-2 --name "DREX" --symbol "DREX"

Mint

  sss-token mint <RECIPIENT> <AMOUNT> --mint <MINT_ADDRESS>

Burn

  sss-token burn <AMOUNT> --mint <MINT_ADDRESS>

Freeze / Thaw

  sss-token freeze <TOKEN_ACCOUNT> --mint <MINT_ADDRESS>

  sss-token thaw <TOKEN_ACCOUNT> --mint <MINT_ADDRESS>

Pause / Unpause

  sss-token pause --mint <MINT_ADDRESS>

  sss-token unpause --mint <MINT_ADDRESS>

Blacklist (SSS-2)

  sss-token blacklist add <ADDRESS> --reason "OFAC" --mint <MINT_ADDRESS>

  sss-token blacklist remove <ADDRESS> --mint <MINT_ADDRESS>

  sss-token blacklist check <ADDRESS> --mint <MINT_ADDRESS>

Seize (SSS-2)

  sss-token seize <TARGET_ATA> --to <TREASURY_ATA> --mint <MINT_ADDRESS>

Minters

  sss-token minters list --mint <MINT_ADDRESS>

  sss-token minters add <ADDRESS> --quota 1000000 --mint <MINT_ADDRESS>

  sss-token minters remove <ADDRESS> --mint <MINT_ADDRESS>

Status

  sss-token status --mint <MINT_ADDRESS>

Supply

  sss-token supply --mint <MINT_ADDRESS>

Holders

  sss-token holders --mint <MINT_ADDRESS>

Audit Log (backend)

  sss-token audit-log --mint <MINT_ADDRESS>
