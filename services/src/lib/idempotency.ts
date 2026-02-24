import type { createClient } from "redis";

export type IdempotencyStatus = "processing" | "completed";

export interface IdempotencyRecord {
  status: IdempotencyStatus;
  response?: unknown;
  updatedAt: number;
}

export interface IdempotencyStore {
  get: (key: string) => Promise<IdempotencyRecord | null>;
  lock: (
    key: string,
  ) => Promise<{ acquired: boolean; existing?: IdempotencyRecord | null }>;
  complete: (key: string, response: unknown) => Promise<void>;
  clear: (key: string) => Promise<void>;
}

const DefaultTtlMs = 24 * 60 * 60 * 1000;

type RedisClient = ReturnType<typeof createClient>;

export function createRedisIdempotencyStore(
  client: RedisClient,
  ttlMs = DefaultTtlMs,
): IdempotencyStore {
  return {
    get: async (key) => {
      const value = await client.get(key);
      return value ? parseRecord(value) : null;
    },
    lock: async (key) => {
      const record: IdempotencyRecord = {
        status: "processing",
        updatedAt: Date.now(),
      };
      const result = await client.set(key, JSON.stringify(record), {
        NX: true,
        PX: ttlMs,
      });
      if (result === null) {
        const existing = await client.get(key);
        return {
          acquired: false,
          existing: existing ? parseRecord(existing) : null,
        };
      }
      return { acquired: true };
    },
    complete: async (key, response) => {
      const record: IdempotencyRecord = {
        status: "completed",
        response,
        updatedAt: Date.now(),
      };
      await client.set(key, JSON.stringify(record), { PX: ttlMs });
    },
    clear: async (key) => {
      await client.del(key);
    },
  };
}

export function createMemoryIdempotencyStore(
  ttlMs = DefaultTtlMs,
): IdempotencyStore {
  const store = new Map<string, IdempotencyRecord>();
  return {
    get: async (key) => {
      const record = store.get(key);
      if (!record) {
        return null;
      }
      if (Date.now() - record.updatedAt > ttlMs) {
        store.delete(key);
        return null;
      }
      return record;
    },
    lock: async (key) => {
      const existing = await store.get(key);
      if (existing && Date.now() - existing.updatedAt <= ttlMs) {
        return { acquired: false, existing };
      }
      const record: IdempotencyRecord = {
        status: "processing",
        updatedAt: Date.now(),
      };
      store.set(key, record);
      return { acquired: true };
    },
    complete: async (key, response) => {
      store.set(key, {
        status: "completed",
        response,
        updatedAt: Date.now(),
      });
    },
    clear: async (key) => {
      store.delete(key);
    },
  };
}

function parseRecord(value: string): IdempotencyRecord {
  const parsed = JSON.parse(value) as IdempotencyRecord;
  return {
    status: parsed.status,
    response: parsed.response,
    updatedAt: parsed.updatedAt ?? Date.now(),
  };
}
