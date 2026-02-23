# SDK

## Installation

Published package

  npm install @stbr/sss-token


Local build

  cd sdk/sss-token

  npm install

  npm run build

## Presets

- SSS-1: minimal profile.

- SSS-2: compliant profile with transfer hook and seizure.

## Custom Config

Use a custom config when you want to enable or disable extensions manually.

Fields you can override

- permanentDelegate

- transferHook

- defaultAccountFrozen

## API Overview

Primary class

  SolanaStablecoin

Core methods

- create

- fromExisting

- mint

- burn

- freeze

- thaw

- pause

- unpause

Modules

- compliance: SSS-2 only.

- roles: grant and revoke roles.

## Example

```ts
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Presets, SolanaStablecoin } from "@stbr/sss-token";

const connection = new Connection("https://api.devnet.solana.com");
const authority = Keypair.generate();

const stablecoin = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "DREX",
  symbol: "DREX",
  decimals: 6,
  authority,
});

const recipient = new PublicKey("9xYZ...abc");
await stablecoin.mint({ recipient, amount: 1_000_000 });
```

## Errors

The SDK wraps Anchor errors into typed exceptions.
Use try/catch and surface readable messages to users.
