import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryIdempotencyStore } from "./idempotency.js";

test("idempotency store locks and completes", async () => {
  const store = createMemoryIdempotencyStore(1000);
  const first = await store.lock("abc");
  assert.equal(first.acquired, true);

  const second = await store.lock("abc");
  assert.equal(second.acquired, false);

  await store.complete("abc", { ok: true });
  const record = await store.get("abc");
  assert.equal(record?.status, "completed");
});
