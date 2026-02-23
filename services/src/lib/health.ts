import type { createClient } from "redis";

import type { AppContext } from "../context.js";
import { pingDatabase } from "./db.js";

export async function buildHealth(context: AppContext): Promise<Record<string, unknown>> {
  const dbOk = await pingDatabase(context.db);
  const redisOk = await pingRedis(context.redisClient);
  let solanaOk = false;
  let isPaused: boolean | null = null;

  if (context.solana) {
    try {
      await context.solana.getSupply();
      solanaOk = true;
      const config = await context.solana.getConfig();
      isPaused = config.isPaused;
    } catch {
      solanaOk = false;
    }
  }

  return {
    status: "healthy",
    service: context.config.service,
    mode: context.config.mode,
    solanaConnection: solanaOk ? "connected" : "missing",
    database: dbOk ? "connected" : "missing",
    redis: redisOk ? "connected" : "missing",
    programId: context.config.programId ?? "missing",
    mintAddress: context.config.mintAddress ?? "missing",
    isPaused,
    uptime: process.uptime(),
  };
}

type RedisClient = ReturnType<typeof createClient>;

async function pingRedis(client: RedisClient | null | undefined): Promise<boolean> {
  if (!client) {
    return false;
  }
  try {
    const result = await client.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}
