import { z } from "zod";

export type ServiceKind = "mint-burn" | "indexer" | "compliance";
export type ServiceMode = "mock" | "live";

export interface ServiceConfig {
  service: ServiceKind;
  mode: ServiceMode;
  port: number;
  logLevel: string;
  commitment: string;
  rateLimitPerSecond: number;
  webhookMaxAttempts: number;
  webhookRetryBaseSeconds: number;
  webhookDispatchIntervalSeconds: number;
  rpcUrl?: string;
  wsUrl?: string;
  programId?: string;
  mintAddress?: string;
  authorityKeypairPath?: string;
  databaseUrl?: string;
  redisUrl?: string;
  apiKey?: string;
  screeningProvider?: string;
  screeningApiKey?: string;
}

const ServiceKindSchema = z.enum(["mint-burn", "indexer", "compliance"]);
const ServiceModeSchema = z.enum(["mock", "live"]);

const EnvSchema = z
  .object({
    SERVICE_KIND: ServiceKindSchema.optional(),
    SERVICE_MODE: ServiceModeSchema.optional(),
    PORT: z.coerce.number().optional(),
    LOG_LEVEL: z.string().optional(),
    COMMITMENT: z.string().optional(),
    RATE_LIMIT_RPS: z.coerce.number().optional(),
    WEBHOOK_MAX_ATTEMPTS: z.coerce.number().optional(),
    WEBHOOK_RETRY_BASE_SECONDS: z.coerce.number().optional(),
    WEBHOOK_DISPATCH_INTERVAL_SECONDS: z.coerce.number().optional(),
    SOLANA_RPC_URL: z.string().optional(),
    SOLANA_WS_URL: z.string().optional(),
    PROGRAM_ID: z.string().optional(),
    MINT_ADDRESS: z.string().optional(),
    AUTHORITY_KEYPAIR_PATH: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    REDIS_URL: z.string().optional(),
    API_KEY: z.string().optional(),
    SCREENING_PROVIDER: z.string().optional(),
    SCREENING_API_KEY: z.string().optional(),
  })
  .passthrough();

export function loadConfig(args: string[]): ServiceConfig {
  const env = EnvSchema.parse(process.env);
  const serviceArg = readArg(args, "--service");
  const portArg = readArg(args, "--port");
  const modeArg = readArg(args, "--mode");

  const service = ServiceKindSchema.parse(
    serviceArg ?? env.SERVICE_KIND ?? "mint-burn",
  );
  const mode = ServiceModeSchema.parse(modeArg ?? env.SERVICE_MODE ?? "mock");

  const port =
    portArg !== undefined
      ? Number(portArg)
      : env.PORT ?? defaultPort(service);

  return {
    service,
    mode,
    port,
    logLevel: env.LOG_LEVEL ?? "info",
    commitment: env.COMMITMENT ?? "confirmed",
    rateLimitPerSecond: env.RATE_LIMIT_RPS ?? 10,
    webhookMaxAttempts: env.WEBHOOK_MAX_ATTEMPTS ?? 6,
    webhookRetryBaseSeconds: env.WEBHOOK_RETRY_BASE_SECONDS ?? 1,
    webhookDispatchIntervalSeconds: env.WEBHOOK_DISPATCH_INTERVAL_SECONDS ?? 5,
    rpcUrl: env.SOLANA_RPC_URL,
    wsUrl: env.SOLANA_WS_URL,
    programId: env.PROGRAM_ID,
    mintAddress: env.MINT_ADDRESS,
    authorityKeypairPath: env.AUTHORITY_KEYPAIR_PATH,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    apiKey: env.API_KEY,
    screeningProvider: env.SCREENING_PROVIDER,
    screeningApiKey: env.SCREENING_API_KEY,
  };
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function defaultPort(service: ServiceKind): number {
  switch (service) {
    case "mint-burn":
      return 3001;
    case "indexer":
      return 3002;
    case "compliance":
      return 3003;
  }
}
