import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AppContext } from "../context.js";
import { insertOperation, listOperations } from "../lib/db.js";
import { parseAmount, parsePublicKey } from "../lib/solana.js";

interface MintBurnResponse {
  success: boolean;
  signature: string;
  supply: string;
  timestamp: string;
}

const MintRequestSchema = z.object({
  recipient: z.string().min(32),
  amount: z.union([z.string(), z.number()]),
  memo: z.string().max(200).optional(),
});

const BurnRequestSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  memo: z.string().max(200).optional(),
});

const mockState = {
  supply: 0n,
  totalMinted: 0n,
  totalBurned: 0n,
  decimals: 6,
};

const mockOperations: Array<{
  id: number;
  operationType: string;
  address: string;
  amount: string;
  memo: string | null;
  signature: string | null;
  idempotencyKey: string | null;
  status: string;
  createdAt: string;
}> = [];

export function registerMintBurnRoutes(
  app: FastifyInstance,
  context: AppContext,
): void {
  const rateLimit = {
    max: context.config.rateLimitPerSecond,
    timeWindow: 1000,
  };

  app.post(
    "/api/v1/mint",
    { config: { rateLimit } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkApiKey(request, reply, context)) {
        return;
      }
      if (context.config.mode === "live" && !context.solana) {
        reply.code(503).send({ error: "solana_not_configured" });
        return;
      }
      const idempotencyKey = readIdempotencyKey(request);
      if (!idempotencyKey) {
        reply.code(400).send({ error: "missing_idempotency_key" });
        return;
      }

      const payload = MintRequestSchema.safeParse(request.body);
      if (!payload.success) {
        reply.code(400).send({ error: "invalid_request", details: payload.error.flatten() });
        return;
      }

      let amount: bigint;
      let recipient: string;
      try {
        amount = parseAmount(payload.data.amount);
        if (amount <= 0n) {
          throw new Error("Amount must be positive");
        }
        parsePublicKey(payload.data.recipient);
        recipient = payload.data.recipient;
      } catch (error) {
        reply.code(400).send({
          error: "invalid_request",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const lock = await context.idempotency.lock(idempotencyKey);
      if (!lock.acquired) {
        if (lock.existing?.status === "completed") {
          reply
            .code(409)
            .send({ error: "idempotency_conflict", result: lock.existing.response });
          return;
        }
        reply.code(409).send({ error: "idempotency_processing" });
        return;
      }

      let signature = "";
      let supplyAmount = "0";
      const timestamp = new Date().toISOString();

      try {
        if (context.config.mode === "mock" || !context.solana) {
          mockState.supply += amount;
          mockState.totalMinted += amount;
          signature = `mock-${Date.now()}`;
          supplyAmount = mockState.supply.toString();
          pushMockOperation({
            operationType: "mint",
            address: recipient,
            amount: amount.toString(),
            memo: payload.data.memo ?? null,
            signature,
            idempotencyKey,
          });
        } else {
          signature = await context.solana.mintTokens(parsePublicKey(recipient), amount);
          const supply = await context.solana.getSupply();
          supplyAmount = supply.amount;
          if (context.db) {
            await insertOperation(context.db, {
              operationType: "mint",
              address: recipient,
              amount: amount.toString(),
              memo: payload.data.memo ?? null,
              signature,
              idempotencyKey,
              status: "completed",
            });
          }
        }
      } catch (error) {
        await context.idempotency.clear(idempotencyKey);
        reply.code(422).send({
          error: "transaction_failed",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const response: MintBurnResponse = {
        success: true,
        signature,
        supply: supplyAmount,
        timestamp,
      };
      await context.idempotency.complete(idempotencyKey, response);
      reply.code(201).send(response);
    },
  );

  app.post(
    "/api/v1/burn",
    { config: { rateLimit } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkApiKey(request, reply, context)) {
        return;
      }
      if (context.config.mode === "live" && !context.solana) {
        reply.code(503).send({ error: "solana_not_configured" });
        return;
      }
      const idempotencyKey = readIdempotencyKey(request);
      if (!idempotencyKey) {
        reply.code(400).send({ error: "missing_idempotency_key" });
        return;
      }

      const payload = BurnRequestSchema.safeParse(request.body);
      if (!payload.success) {
        reply.code(400).send({ error: "invalid_request", details: payload.error.flatten() });
        return;
      }

      let amount: bigint;
      try {
        amount = parseAmount(payload.data.amount);
        if (amount <= 0n) {
          throw new Error("Amount must be positive");
        }
      } catch (error) {
        reply.code(400).send({
          error: "invalid_request",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const lock = await context.idempotency.lock(idempotencyKey);
      if (!lock.acquired) {
        if (lock.existing?.status === "completed") {
          reply
            .code(409)
            .send({ error: "idempotency_conflict", result: lock.existing.response });
          return;
        }
        reply.code(409).send({ error: "idempotency_processing" });
        return;
      }

      let signature = "";
      let supplyAmount = "0";
      const timestamp = new Date().toISOString();

      try {
        if (context.config.mode === "mock" || !context.solana) {
          mockState.supply = mockState.supply > amount ? mockState.supply - amount : 0n;
          mockState.totalBurned += amount;
          signature = `mock-${Date.now()}`;
          supplyAmount = mockState.supply.toString();
          pushMockOperation({
            operationType: "burn",
            address: "self",
            amount: amount.toString(),
            memo: payload.data.memo ?? null,
            signature,
            idempotencyKey,
          });
        } else {
          signature = await context.solana.burnTokens(amount);
          const supply = await context.solana.getSupply();
          supplyAmount = supply.amount;
          if (context.db) {
            await insertOperation(context.db, {
              operationType: "burn",
              address: "self",
              amount: amount.toString(),
              memo: payload.data.memo ?? null,
              signature,
              idempotencyKey,
              status: "completed",
            });
          }
        }
      } catch (error) {
        await context.idempotency.clear(idempotencyKey);
        reply.code(422).send({
          error: "transaction_failed",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const response: MintBurnResponse = {
        success: true,
        signature,
        supply: supplyAmount,
        timestamp,
      };
      await context.idempotency.complete(idempotencyKey, response);
      reply.code(201).send(response);
    },
  );

  app.get(
    "/api/v1/supply",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (context.config.mode === "live" && !context.solana) {
        reply.code(503).send({ error: "solana_not_configured" });
        return;
      }
    if (context.config.mode === "mock" || !context.solana) {
      reply.send({
        supply: mockState.supply.toString(),
        totalMinted: mockState.totalMinted.toString(),
        totalBurned: mockState.totalBurned.toString(),
        decimals: mockState.decimals,
        formattedSupply: formatAmount(mockState.supply.toString(), mockState.decimals),
      });
      return;
    }
    try {
      const supply = await context.solana.getSupply();
      const config = await context.solana.getConfig();
      reply.send({
        supply: supply.amount,
        totalMinted: config.totalMinted.toString(),
        totalBurned: config.totalBurned.toString(),
        decimals: supply.decimals,
        formattedSupply: formatAmount(supply.amount, supply.decimals),
      });
    } catch (error) {
      reply.code(500).send({
        error: "supply_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    },
  );

  app.get(
    "/api/v1/operations",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string | undefined>;
      const page = Number(query.page ?? "1");
      const limit = Number(query.limit ?? "20");
      const type = query.type;
      const from = query.from;
      const to = query.to;

      if (context.config.mode === "mock" || !context.db) {
        const filtered = type
          ? mockOperations.filter((op) => op.operationType === type)
          : mockOperations;
        const start = Math.max(0, (page - 1) * limit);
        reply.send({
          page,
          limit,
          total: filtered.length,
          items: filtered.slice(start, start + limit),
        });
        return;
      }

      const results = await listOperations(context.db, {
        type,
        from,
        to,
        page,
        limit,
      });
      reply.send({
        page,
        limit,
        total: results.total,
        items: results.items,
      });
    },
  );
}

function checkApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
  context: AppContext,
): boolean {
  if (!context.config.apiKey) {
    return true;
  }
  const header = request.headers.authorization;
  if (!header || header !== `Bearer ${context.config.apiKey}`) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

function readIdempotencyKey(request: FastifyRequest): string | undefined {
  const value = request.headers["x-idempotency-key"];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function formatAmount(amount: string, decimals: number): string {
  if (decimals <= 0) {
    return amount;
  }
  const value = amount.padStart(decimals + 1, "0");
  const splitIndex = value.length - decimals;
  return `${value.slice(0, splitIndex)}.${value.slice(splitIndex)}`;
}

function pushMockOperation(input: {
  operationType: string;
  address: string;
  amount: string;
  memo: string | null;
  signature: string;
  idempotencyKey: string;
}): void {
  mockOperations.unshift({
    id: mockOperations.length + 1,
    operationType: input.operationType,
    address: input.address,
    amount: input.amount,
    memo: input.memo,
    signature: input.signature,
    idempotencyKey: input.idempotencyKey,
    status: "completed",
    createdAt: new Date().toISOString(),
  });
}
