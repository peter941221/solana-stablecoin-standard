import "dotenv/config";

import { Connection } from "@solana/web3.js";
import { createClient } from "redis";

import { loadConfig } from "./config.js";
import type { AppContext } from "./context.js";
import { createDatabase } from "./lib/db.js";
import { createMemoryIdempotencyStore, createRedisIdempotencyStore } from "./lib/idempotency.js";
import { EventIndexer } from "./lib/indexer.js";
import { EventStream } from "./lib/stream.js";
import { StablecoinClient, loadKeypair, parsePublicKey } from "./lib/solana.js";
import { WebhookDispatcher } from "./lib/webhooks.js";
import { buildServer } from "./server.js";

type RedisClient = ReturnType<typeof createClient>;

async function start(): Promise<void> {
  const config = loadConfig(process.argv.slice(2));

  validateConfig(config);

  const db = createDatabase(config.databaseUrl);
  const redisClient = await createRedis(config.redisUrl);
  const idempotency = redisClient
    ? createRedisIdempotencyStore(redisClient)
    : createMemoryIdempotencyStore();

  const connection = buildConnection(config.rpcUrl, config.wsUrl, config.commitment);
  const solanaClient = buildStablecoinClient(config, connection);

  const eventStream = config.service === "indexer" ? new EventStream() : undefined;
  const webhooks =
    config.service === "indexer" && db
      ? new WebhookDispatcher({
          db,
          maxAttempts: config.webhookMaxAttempts,
          retryBaseSeconds: config.webhookRetryBaseSeconds,
          dispatchIntervalSeconds: config.webhookDispatchIntervalSeconds,
          log: (message, meta) => {
            console.log(message, meta ?? {});
          },
        })
      : undefined;

  const context: AppContext = {
    config,
    db,
    redisClient,
    idempotency,
    solana: solanaClient,
    eventStream,
    webhooks,
  };

  const app = await buildServer(context);

  if (config.service === "indexer" && config.mode === "live" && db && connection) {
    if (!config.programId) {
      throw new Error("PROGRAM_ID is required for indexer");
    }
    const indexer = new EventIndexer({
      connection,
      programId: parsePublicKey(config.programId),
      db,
      context,
      commitment: config.commitment as "processed" | "confirmed" | "finalized",
      log: (message, meta) => app.log.info(meta ?? {}, message),
    });
    webhooks?.start();
    indexer.start();
    app.addHook("onClose", async () => {
      indexer.stop();
      webhooks?.stop();
    });
  }

  try {
    await app.listen({
      host: "0.0.0.0",
      port: config.port,
    });
    app.log.info(
      {
        service: config.service,
        mode: config.mode,
        port: config.port,
      },
      "Service started",
    );
  } catch (error) {
    app.log.error({ err: error }, "Failed to start service");
    process.exit(1);
  }

  registerShutdown(app, db, redisClient);
}

function validateConfig(config: ReturnType<typeof loadConfig>): void {
  if (config.mode !== "live") {
    return;
  }
  const missing: string[] = [];
  if (config.service === "mint-burn" || config.service === "compliance") {
    if (!config.rpcUrl) missing.push("SOLANA_RPC_URL");
    if (!config.programId) missing.push("PROGRAM_ID");
    if (!config.mintAddress) missing.push("MINT_ADDRESS");
    if (!config.authorityKeypairPath) missing.push("AUTHORITY_KEYPAIR_PATH");
  }
  if (config.service === "mint-burn") {
    if (!config.databaseUrl) missing.push("DATABASE_URL");
    if (!config.redisUrl) missing.push("REDIS_URL");
  }
  if (config.service === "compliance") {
    if (!config.databaseUrl) missing.push("DATABASE_URL");
  }
  if (config.service === "indexer") {
    if (!config.wsUrl && !config.rpcUrl) missing.push("SOLANA_WS_URL or SOLANA_RPC_URL");
    if (!config.programId) missing.push("PROGRAM_ID");
    if (!config.databaseUrl) missing.push("DATABASE_URL");
  }
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function buildConnection(
  rpcUrl: string | undefined,
  wsUrl: string | undefined,
  commitment: string,
): Connection | null {
  if (!rpcUrl && !wsUrl) {
    return null;
  }
  const endpoint = rpcUrl ?? deriveHttpEndpoint(wsUrl ?? "");
  return new Connection(endpoint, {
    commitment: commitment as "confirmed" | "processed" | "finalized",
    wsEndpoint: wsUrl ?? undefined,
  });
}

function buildStablecoinClient(config: ReturnType<typeof loadConfig>, connection: Connection | null): StablecoinClient | null {
  if (!connection || !config.programId || !config.mintAddress || !config.authorityKeypairPath) {
    return null;
  }
  const programId = parsePublicKey(config.programId);
  const mint = parsePublicKey(config.mintAddress);
  const authority = loadKeypair(config.authorityKeypairPath);
  return new StablecoinClient({
    connection,
    programId,
    mint,
    authority,
  });
}

async function createRedis(url?: string): Promise<RedisClient | null> {
  if (!url) {
    return null;
  }
  const client = createClient({ url });
  client.on("error", (error: unknown) => {
    console.error("redis error", error);
  });
  await client.connect();
  return client;
}

function deriveHttpEndpoint(wsUrl: string): string {
  if (wsUrl.startsWith("wss://")) {
    return wsUrl.replace("wss://", "https://");
  }
  if (wsUrl.startsWith("ws://")) {
    return wsUrl.replace("ws://", "http://");
  }
  return wsUrl;
}

function registerShutdown(
  app: Awaited<ReturnType<typeof buildServer>>,
  db: ReturnType<typeof createDatabase>,
  redisClient: RedisClient | null,
): void {
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    if (db) {
      await db.close();
    }
    if (redisClient) {
      await redisClient.quit();
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start();
