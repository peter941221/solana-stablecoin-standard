import { EventParser, BorshCoder } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";

import type { AppContext } from "../context.js";
import type { Database } from "./db.js";
import { insertEvent, setIndexerState } from "./db.js";
import { stablecoinIdl } from "./idl.js";

export interface IndexerConfig {
  connection: Connection;
  programId: PublicKey;
  db: Database;
  context: AppContext;
  commitment: "processed" | "confirmed" | "finalized";
  log: (message: string, meta?: Record<string, unknown>) => void;
}

export class EventIndexer {
  private readonly connection: Connection;
  private readonly programId: PublicKey;
  private readonly db: Database;
  private readonly context: AppContext;
  private readonly commitment: "processed" | "confirmed" | "finalized";
  private readonly log: (message: string, meta?: Record<string, unknown>) => void;
  private readonly parser: EventParser;
  private subscriptionId: number | null = null;

  constructor(config: IndexerConfig) {
    this.connection = config.connection;
    this.programId = config.programId;
    this.db = config.db;
    this.context = config.context;
    this.commitment = config.commitment;
    this.log = config.log;
    this.parser = new EventParser(this.programId, new BorshCoder(stablecoinIdl));
  }

  start(): void {
    if (this.subscriptionId !== null) {
      return;
    }
    this.subscriptionId = this.connection.onLogs(
      this.programId,
      (logs, ctx) => {
        if (logs.err) {
          return;
        }
        try {
          const events = this.parser.parseLogs(logs.logs) ?? [];
          for (const event of events) {
            void this.handleEvent(event.name, event.data, logs.signature, ctx.slot);
          }
        } catch (error) {
          this.log("indexer parse error", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      this.commitment,
    );
    this.log("indexer subscribed", { programId: this.programId.toBase58() });
  }

  stop(): void {
    if (this.subscriptionId === null) {
      return;
    }
    void this.connection.removeOnLogsListener(this.subscriptionId);
    this.subscriptionId = null;
  }

  private async handleEvent(
    name: string,
    data: Record<string, unknown>,
    signature: string,
    slot: number,
  ): Promise<void> {
    const normalized = normalizeData(data);
    const configValue = normalized.config;
    const configAddress = typeof configValue === "string" ? configValue : "unknown";
    const timestampValue = normalized.timestamp;
    const timestamp =
      typeof timestampValue === "string" || typeof timestampValue === "number"
        ? new Date(Number(timestampValue) * 1000).toISOString()
        : new Date().toISOString();

    const record = await insertEvent(this.db, {
      eventType: name,
      configAddress,
      signature,
      slot,
      timestamp,
      data: normalized,
    });

    if (!record) {
      return;
    }

    await setIndexerState(this.db, { lastSlot: slot });

    if (this.context.webhooks) {
      await this.context.webhooks.enqueueForEvent(record.id, record.eventType);
      await this.context.webhooks.dispatchPending();
    }

    if (this.context.eventStream) {
      this.context.eventStream.broadcast(record.eventType, record);
    }
  }
}

function normalizeData(data: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    output[key] = normalizeValue(value);
  }
  return output;
}

function normalizeValue(value: unknown): string | number | boolean | object | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof PublicKey) {
    return value.toBase58();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.toString === "function" && record.constructor?.name === "BN") {
      return record.toString();
    }
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      output[key] = normalizeValue(entry);
    }
    return output;
  }
  return String(value);
}
