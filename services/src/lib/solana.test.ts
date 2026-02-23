import assert from "node:assert/strict";
import test from "node:test";

import { parseAmount } from "./solana.js";

test("parseAmount handles integers", () => {
  assert.equal(parseAmount("100").toString(), "100");
  assert.equal(parseAmount(250).toString(), "250");
});

test("parseAmount rejects decimals", () => {
  assert.throws(() => parseAmount("1.2"));
});
