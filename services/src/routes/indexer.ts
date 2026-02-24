import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AppContext } from "../context.js";
import { createWebhook, deleteWebhook, listEvents } from "../lib/db.js";

const WebhookSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(z.string()).min(1),
  secret: z.string().min(8),
});

export function registerIndexerRoutes(
  app: FastifyInstance,
  context: AppContext,
): void {
  app.get(
    "/api/v1/events",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!context.db) {
        reply.code(503).send({ error: "database_not_configured" });
        return;
      }
      const query = request.query as Record<string, string | undefined>;
      const page = Number(query.page ?? "1");
      const limit = Number(query.limit ?? "50");
      const type = query.type;
      const config = query.config;
      const from = query.from;
      const to = query.to;

      const results = await listEvents(context.db, {
        type,
        config,
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

  app.get(
    "/api/v1/events/stream",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!context.eventStream) {
        reply.code(503).send({ error: "stream_not_ready" });
        return;
      }
      context.eventStream.add(reply, request);
    },
  );

  app.post(
    "/api/v1/webhooks",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!context.db) {
        reply.code(503).send({ error: "database_not_configured" });
        return;
      }
      const payload = WebhookSchema.safeParse(request.body);
      if (!payload.success) {
        reply.code(400).send({ error: "invalid_request", details: payload.error.flatten() });
        return;
      }
      const record = await createWebhook(context.db, {
        url: payload.data.url,
        eventTypes: payload.data.eventTypes,
        secret: payload.data.secret,
      });
      reply.code(201).send(record);
    },
  );

  app.delete(
    "/api/v1/webhooks/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!context.db) {
        reply.code(503).send({ error: "database_not_configured" });
        return;
      }
      const params = request.params as Record<string, string | undefined>;
      const id = Number(params.id);
      if (!Number.isFinite(id)) {
        reply.code(400).send({ error: "invalid_id" });
        return;
      }
      const deleted = await deleteWebhook(context.db, id);
      if (!deleted) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      reply.code(204).send();
    },
  );
}
