import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AppContext } from "../context.js";
import type { EventRecord } from "../lib/db.js";
import { createMonitoringRule, listEvents } from "../lib/db.js";
import { parsePublicKey } from "../lib/solana.js";

const ScreeningSchema = z.object({
  address: z.string().min(32),
});

const BlacklistSchema = z.object({
  address: z.string().min(32),
  reason: z.string().max(128).optional(),
});

const RuleSchema = z.object({
  name: z.string().min(3),
  condition: z.string().min(3),
  action: z.string().min(3),
  webhookUrl: z.string().url().optional(),
});

const mockBlacklist: Array<{ address: string; reason?: string; isActive: boolean }> = [];

export function registerComplianceRoutes(
  app: FastifyInstance,
  context: AppContext,
): void {
  app.post(
    "/api/v1/screening/check",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = ScreeningSchema.safeParse(request.body);
      if (!payload.success) {
        reply.code(400).send({ error: "invalid_request", details: payload.error.flatten() });
        return;
      }
      if (!context.config.screeningProvider || context.config.screeningProvider === "none") {
        reply.code(503).send({ error: "provider_not_configured" });
        return;
      }
      reply.send({
        address: payload.data.address,
        riskLevel: "low",
        isBlacklisted: false,
        sanctions: {
          ofac: false,
          eu: false,
        },
        checkedAt: new Date().toISOString(),
      });
    },
  );

  app.get("/api/v1/blacklist", async (_request: FastifyRequest, reply: FastifyReply) => {
    if (context.config.mode === "live" && !context.solana) {
      reply.code(503).send({ error: "solana_not_configured" });
      return;
    }
    if (context.config.mode === "mock" || !context.solana) {
      reply.send({
        total: mockBlacklist.length,
        items: mockBlacklist,
      });
      return;
    }
    try {
      const entries = await context.solana.getBlacklistedAddresses();
      reply.send({
        total: entries.length,
        items: entries.map((entry) => ({
          address: entry.wallet.toBase58(),
          reason: entry.reason ?? undefined,
          isActive: entry.isActive,
        })),
      });
    } catch (error) {
      reply.code(500).send({
        error: "blacklist_fetch_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post(
    "/api/v1/blacklist/add",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = BlacklistSchema.safeParse(request.body);
      if (!payload.success) {
        reply.code(400).send({ error: "invalid_request", details: payload.error.flatten() });
        return;
      }
      if (context.config.mode === "live" && !context.solana) {
        reply.code(503).send({ error: "solana_not_configured" });
        return;
      }
      if (context.config.mode === "mock" || !context.solana) {
        const existing = mockBlacklist.find(
          (entry) => entry.address === payload.data.address,
        );
        if (existing) {
          existing.isActive = true;
          existing.reason = payload.data.reason;
          reply.send(existing);
          return;
        }
        const record = {
          address: payload.data.address,
          reason: payload.data.reason,
          isActive: true,
        };
        mockBlacklist.push(record);
        reply.code(201).send(record);
        return;
      }

      try {
        const wallet = parsePublicKey(payload.data.address);
        const signature = await context.solana.addToBlacklist(
          wallet,
          payload.data.reason ?? "",
        );
        reply.code(201).send({
          address: payload.data.address,
          signature,
        });
      } catch (error) {
        reply.code(422).send({
          error: "blacklist_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  app.post(
    "/api/v1/blacklist/remove",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = BlacklistSchema.safeParse(request.body);
      if (!payload.success) {
        reply.code(400).send({ error: "invalid_request", details: payload.error.flatten() });
        return;
      }
      if (context.config.mode === "live" && !context.solana) {
        reply.code(503).send({ error: "solana_not_configured" });
        return;
      }
      if (context.config.mode === "mock" || !context.solana) {
        const existing = mockBlacklist.find(
          (entry) => entry.address === payload.data.address,
        );
        if (!existing) {
          reply.code(404).send({ error: "not_found" });
          return;
        }
        existing.isActive = false;
        reply.send(existing);
        return;
      }

      try {
        const wallet = parsePublicKey(payload.data.address);
        const signature = await context.solana.removeFromBlacklist(wallet);
        reply.send({
          address: payload.data.address,
          signature,
        });
      } catch (error) {
        reply.code(422).send({
          error: "blacklist_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  app.get(
    "/api/v1/audit/export",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!context.db) {
        reply.code(503).send({ error: "database_not_configured" });
        return;
      }
      const query = request.query as Record<string, string | undefined>;
      const format = (query.format ?? "json").toLowerCase();
      const from = query.from;
      const to = query.to;
      const actionType = query.action_type ? query.action_type.toUpperCase() : undefined;

      const results = await listEvents(context.db, {
        type: actionType ? mapActionToEventType(actionType) : undefined,
        config: query.config,
        from,
        to,
        page: 1,
        limit: 500,
      });

      const entries = results.items.map(buildAuditEntry);

      if (format === "csv") {
        reply
          .header("Content-Type", "text/csv")
          .header("Content-Disposition", "attachment; filename=sss-audit.csv")
          .send(buildCsv(entries));
        return;
      }

      reply.send({ items: entries });
    },
  );

  app.post(
    "/api/v1/monitoring/rules",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!context.db) {
        reply.code(503).send({ error: "database_not_configured" });
        return;
      }
      const payload = RuleSchema.safeParse(request.body);
      if (!payload.success) {
        reply.code(400).send({ error: "invalid_request", details: payload.error.flatten() });
        return;
      }
      const record = await createMonitoringRule(context.db, {
        name: payload.data.name,
        condition: payload.data.condition,
        action: payload.data.action,
        webhookUrl: payload.data.webhookUrl,
      });
      reply.code(201).send(record);
    },
  );
}

function buildAuditEntry(event: EventRecord): {
  timestamp: string;
  action: string;
  actor: string;
  target: string;
  amount: string;
  details: string;
  tx_signature: string;
} {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const get = (key: string) => data[key];
  const action = mapEventToAction(event.eventType);

  let actor = String(get("minter") ?? get("burner") ?? get("frozen_by") ?? get("thawed_by") ?? get("paused_by") ?? get("unpaused_by") ?? get("updated_by") ?? get("blacklisted_by") ?? get("removed_by") ?? get("seized_by") ?? get("old_authority") ?? "");
  let target = String(get("recipient") ?? get("target_account") ?? get("wallet") ?? get("from_account") ?? get("new_authority") ?? "");
  let amount = String(get("amount") ?? "");
  let details = String(get("reason") ?? get("new_roles") ?? "");

  if (actor === "undefined") actor = "";
  if (target === "undefined") target = "";
  if (amount === "undefined") amount = "";
  if (details === "undefined") details = "";

  return {
    timestamp: event.timestamp,
    action,
    actor,
    target,
    amount,
    details,
    tx_signature: event.signature,
  };
}

function buildCsv(entries: Array<Record<string, string>>): string {
  const header = "timestamp,action,actor,target,amount,details,tx_signature";
  const rows = entries.map((entry) => {
    return [
      entry.timestamp,
      entry.action,
      entry.actor,
      entry.target,
      entry.amount,
      entry.details,
      entry.tx_signature,
    ]
      .map(csvEscape)
      .join(",");
  });
  return [header, ...rows].join("\n") + "\n";
}

function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, "\"\"");
  if (escaped.includes(",") || escaped.includes("\n")) {
    return `"${escaped}"`;
  }
  return escaped;
}

function mapEventToAction(eventType: string): string {
  const map: Record<string, string> = {
    StablecoinInitialized: "INIT",
    TokensMinted: "MINT",
    TokensBurned: "BURN",
    AccountFrozen: "FREEZE",
    AccountThawed: "THAW",
    SystemPaused: "PAUSE",
    SystemUnpaused: "UNPAUSE",
    RoleUpdated: "ROLE_UPDATED",
    AuthorityTransferred: "AUTHORITY_TRANSFER",
    BlacklistAdded: "BLACKLIST_ADD",
    BlacklistRemoved: "BLACKLIST_REMOVE",
    TokensSeized: "SEIZE",
  };
  return map[eventType] ?? eventType;
}

function mapActionToEventType(action: string): string | undefined {
  const map: Record<string, string> = {
    INIT: "StablecoinInitialized",
    MINT: "TokensMinted",
    BURN: "TokensBurned",
    FREEZE: "AccountFrozen",
    THAW: "AccountThawed",
    PAUSE: "SystemPaused",
    UNPAUSE: "SystemUnpaused",
    ROLE_UPDATED: "RoleUpdated",
    AUTHORITY_TRANSFER: "AuthorityTransferred",
    BLACKLIST_ADD: "BlacklistAdded",
    BLACKLIST_REMOVE: "BlacklistRemoved",
    SEIZE: "TokensSeized",
  };
  return map[action];
}
