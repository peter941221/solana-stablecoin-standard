import type { createClient } from "redis";

import type { ServiceConfig } from "./config.js";
import type { Database } from "./lib/db.js";
import type { IdempotencyStore } from "./lib/idempotency.js";
import type { StablecoinClient } from "./lib/solana.js";
import type { EventStream } from "./lib/stream.js";
import type { WebhookDispatcher } from "./lib/webhooks.js";

type RedisClient = ReturnType<typeof createClient>;

export interface AppContext {
  config: ServiceConfig;
  db: Database | null;
  redisClient: RedisClient | null;
  idempotency: IdempotencyStore;
  solana: StablecoinClient | null;
  eventStream?: EventStream;
  webhooks?: WebhookDispatcher;
}
