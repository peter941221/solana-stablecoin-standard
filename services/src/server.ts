import fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

import type { AppContext } from "./context.js";
import { buildHealth } from "./lib/health.js";
import { registerComplianceRoutes } from "./routes/compliance.js";
import { registerIndexerRoutes } from "./routes/indexer.js";
import { registerMintBurnRoutes } from "./routes/mintBurn.js";

export async function buildServer(context: AppContext): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: context.config.logLevel,
    },
  });

  await app.register(rateLimit, { global: false });

  app.get("/api/v1/health", async () => buildHealth(context));

  switch (context.config.service) {
    case "mint-burn":
      registerMintBurnRoutes(app, context);
      break;
    case "indexer":
      registerIndexerRoutes(app, context);
      break;
    case "compliance":
      registerComplianceRoutes(app, context);
      break;
  }

  return app;
}
