import { Pool } from "pg";

export interface Database {
  pool: Pool;
  close: () => Promise<void>;
}

export interface OperationRecord {
  id: number;
  operationType: string;
  address: string;
  amount: string;
  memo: string | null;
  signature: string | null;
  idempotencyKey: string | null;
  status: string;
  createdAt: string;
}

export interface EventRecord {
  id: number;
  eventType: string;
  configAddress: string;
  signature: string;
  slot: number;
  timestamp: string;
  data: unknown;
}

export interface WebhookRecord {
  id: number;
  url: string;
  eventTypes: string[];
  secret: string;
  isActive: boolean;
  createdAt: string;
}

export interface DeliveryRecord {
  id: number;
  webhookId: number;
  eventId: number;
  status: string;
  attempts: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  responseCode: number | null;
}

export interface DeliveryPayload {
  delivery: DeliveryRecord;
  webhook: WebhookRecord;
  event: EventRecord;
}

export interface MonitoringRuleRecord {
  id: number;
  name: string;
  condition: string;
  action: string;
  webhookUrl: string | null;
}

export interface OperationFilters {
  type?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export interface EventFilters {
  type?: string;
  config?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export function createDatabase(url?: string): Database | null {
  if (!url) {
    return null;
  }
  const pool = new Pool({ connectionString: url });
  return {
    pool,
    close: () => pool.end(),
  };
}

export async function pingDatabase(db: Database | null): Promise<boolean> {
  if (!db) {
    return false;
  }
  try {
    await db.pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function insertOperation(
  db: Database,
  input: {
    operationType: string;
    address: string;
    amount: string;
    memo?: string | null;
    signature?: string | null;
    idempotencyKey?: string | null;
    status?: string;
  },
): Promise<OperationRecord> {
  const result = await db.pool.query(
    "INSERT INTO operations (operation_type, address, amount, memo, signature, idempotency_key, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, operation_type, address, amount, memo, signature, idempotency_key, status, created_at",
    [
      input.operationType,
      input.address,
      input.amount,
      input.memo ?? null,
      input.signature ?? null,
      input.idempotencyKey ?? null,
      input.status ?? "completed",
    ],
  );
  return mapOperation(result.rows[0]);
}

export async function listOperations(
  db: Database,
  filters: OperationFilters,
): Promise<{ items: OperationRecord[]; total: number }> {
  const where = [] as string[];
  const params: Array<string | number> = [];
  if (filters.type) {
    params.push(filters.type);
    where.push(`operation_type = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`created_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`created_at <= $${params.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const countResult = await db.pool.query(
    `SELECT COUNT(*)::int as count FROM operations ${whereClause}`,
    params,
  );

  const limit = Math.max(1, filters.limit);
  const offset = Math.max(0, (filters.page - 1) * limit);
  params.push(limit, offset);
  const result = await db.pool.query(
    `SELECT id, operation_type, address, amount, memo, signature, idempotency_key, status, created_at FROM operations ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    items: result.rows.map(mapOperation),
    total: countResult.rows[0]?.count ?? 0,
  };
}

export async function insertEvent(
  db: Database,
  input: {
    eventType: string;
    configAddress: string;
    signature: string;
    slot: number;
    timestamp: string;
    data: unknown;
  },
): Promise<EventRecord | null> {
  const result = await db.pool.query(
    "INSERT INTO events (event_type, config_address, signature, slot, timestamp, data) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (signature) DO NOTHING RETURNING id, event_type, config_address, signature, slot, timestamp, data",
    [
      input.eventType,
      input.configAddress,
      input.signature,
      input.slot,
      input.timestamp,
      input.data,
    ],
  );

  if (result.rowCount === 0) {
    return null;
  }
  return mapEvent(result.rows[0]);
}

export async function listEvents(
  db: Database,
  filters: EventFilters,
): Promise<{ items: EventRecord[]; total: number }> {
  const where = [] as string[];
  const params: Array<string | number> = [];
  if (filters.type) {
    params.push(filters.type);
    where.push(`event_type = $${params.length}`);
  }
  if (filters.config) {
    params.push(filters.config);
    where.push(`config_address = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`timestamp >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`timestamp <= $${params.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const countResult = await db.pool.query(
    `SELECT COUNT(*)::int as count FROM events ${whereClause}`,
    params,
  );

  const limit = Math.max(1, filters.limit);
  const offset = Math.max(0, (filters.page - 1) * limit);
  params.push(limit, offset);
  const result = await db.pool.query(
    `SELECT id, event_type, config_address, signature, slot, timestamp, data FROM events ${whereClause} ORDER BY timestamp DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    items: result.rows.map(mapEvent),
    total: countResult.rows[0]?.count ?? 0,
  };
}

export async function createWebhook(
  db: Database,
  input: { url: string; eventTypes: string[]; secret: string },
): Promise<WebhookRecord> {
  const result = await db.pool.query(
    "INSERT INTO webhooks (url, event_types, secret) VALUES ($1, $2, $3) RETURNING id, url, event_types, secret, is_active, created_at",
    [input.url, input.eventTypes, input.secret],
  );
  return mapWebhook(result.rows[0]);
}

export async function deleteWebhook(db: Database, id: number): Promise<boolean> {
  const result = await db.pool.query("DELETE FROM webhooks WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listWebhooks(db: Database): Promise<WebhookRecord[]> {
  const result = await db.pool.query(
    "SELECT id, url, event_types, secret, is_active, created_at FROM webhooks ORDER BY id ASC",
  );
  return result.rows.map(mapWebhook);
}

export async function listWebhooksForEvent(
  db: Database,
  eventType: string,
): Promise<WebhookRecord[]> {
  const result = await db.pool.query(
    "SELECT id, url, event_types, secret, is_active, created_at FROM webhooks WHERE is_active = true AND $1 = ANY(event_types)",
    [eventType],
  );
  return result.rows.map(mapWebhook);
}

export async function createDelivery(
  db: Database,
  input: { webhookId: number; eventId: number },
): Promise<DeliveryRecord> {
  const result = await db.pool.query(
    "INSERT INTO webhook_deliveries (webhook_id, event_id, status) VALUES ($1, $2, 'pending') RETURNING id, webhook_id, event_id, status, attempts, last_attempt_at, next_retry_at, response_code",
    [input.webhookId, input.eventId],
  );
  return mapDelivery(result.rows[0]);
}

export async function listPendingDeliveries(
  db: Database,
  maxAttempts: number,
  limit: number,
): Promise<DeliveryPayload[]> {
  const result = await db.pool.query(
    "SELECT d.id as delivery_id, d.webhook_id, d.event_id, d.status, d.attempts, d.last_attempt_at, d.next_retry_at, d.response_code, w.id as webhook_id_ref, w.url, w.event_types, w.secret, w.is_active, w.created_at, e.id as event_id_ref, e.event_type, e.config_address, e.signature, e.slot, e.timestamp, e.data FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id JOIN events e ON e.id = d.event_id WHERE d.status IN ('pending', 'failed') AND d.attempts < $1 AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW()) ORDER BY d.created_at ASC LIMIT $2",
    [maxAttempts, limit],
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    delivery: mapDelivery({
      id: row.delivery_id,
      webhook_id: row.webhook_id,
      event_id: row.event_id,
      status: row.status,
      attempts: row.attempts,
      last_attempt_at: row.last_attempt_at,
      next_retry_at: row.next_retry_at,
      response_code: row.response_code,
    }),
    webhook: mapWebhook({
      id: row.webhook_id_ref,
      url: row.url,
      event_types: row.event_types,
      secret: row.secret,
      is_active: row.is_active,
      created_at: row.created_at,
    }),
    event: mapEvent({
      id: row.event_id_ref,
      event_type: row.event_type,
      config_address: row.config_address,
      signature: row.signature,
      slot: row.slot,
      timestamp: row.timestamp,
      data: row.data,
    }),
  }));
}

export async function updateDelivery(
  db: Database,
  input: {
    id: number;
    status: string;
    attempts: number;
    lastAttemptAt: Date | null;
    nextRetryAt: Date | null;
    responseCode?: number | null;
  },
): Promise<void> {
  await db.pool.query(
    "UPDATE webhook_deliveries SET status = $1, attempts = $2, last_attempt_at = $3, next_retry_at = $4, response_code = $5 WHERE id = $6",
    [
      input.status,
      input.attempts,
      input.lastAttemptAt,
      input.nextRetryAt,
      input.responseCode ?? null,
      input.id,
    ],
  );
}

export async function setIndexerState(
  db: Database,
  input: { lastSlot: number },
): Promise<void> {
  await db.pool.query(
    "INSERT INTO indexer_state (id, last_slot) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET last_slot = $1, updated_at = NOW()",
    [input.lastSlot],
  );
}

export async function getIndexerState(db: Database): Promise<number | null> {
  const result = await db.pool.query(
    "SELECT last_slot FROM indexer_state WHERE id = 1",
  );
  return result.rows[0]?.last_slot ?? null;
}

export async function createMonitoringRule(
  db: Database,
  input: { name: string; condition: string; action: string; webhookUrl?: string },
): Promise<{ id: number; createdAt: string }> {
  const result = await db.pool.query(
    "INSERT INTO monitoring_rules (name, condition, action, webhook_url) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
    [input.name, input.condition, input.action, input.webhookUrl ?? null],
  );
  return {
    id: result.rows[0].id,
    createdAt: new Date(result.rows[0].created_at).toISOString(),
  };
}

export async function listMonitoringRules(db: Database): Promise<MonitoringRuleRecord[]> {
  const result = await db.pool.query(
    "SELECT id, name, condition, action, webhook_url FROM monitoring_rules ORDER BY id ASC",
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: row.id as number,
    name: row.name as string,
    condition: row.condition as string,
    action: row.action as string,
    webhookUrl: (row.webhook_url as string) ?? null,
  }));
}

function mapOperation(row: Record<string, unknown>): OperationRecord {
  return {
    id: row.id as number,
    operationType: row.operation_type as string,
    address: row.address as string,
    amount: row.amount as string,
    memo: (row.memo as string) ?? null,
    signature: (row.signature as string) ?? null,
    idempotencyKey: (row.idempotency_key as string) ?? null,
    status: row.status as string,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function mapEvent(row: Record<string, unknown>): EventRecord {
  const dataValue = row.data as string;
  return {
    id: row.id as number,
    eventType: row.event_type as string,
    configAddress: row.config_address as string,
    signature: row.signature as string,
    slot: Number(row.slot as number),
    timestamp: new Date(row.timestamp as string).toISOString(),
    data: typeof dataValue === "string" ? JSON.parse(dataValue) : dataValue,
  };
}

function mapWebhook(row: Record<string, unknown>): WebhookRecord {
  return {
    id: row.id as number,
    url: row.url as string,
    eventTypes: row.event_types as string[],
    secret: row.secret as string,
    isActive: row.is_active as boolean,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function mapDelivery(row: Record<string, unknown>): DeliveryRecord {
  return {
    id: row.id as number,
    webhookId: row.webhook_id as number,
    eventId: row.event_id as number,
    status: row.status as string,
    attempts: row.attempts as number,
    lastAttemptAt: row.last_attempt_at
      ? new Date(row.last_attempt_at as string).toISOString()
      : null,
    nextRetryAt: row.next_retry_at
      ? new Date(row.next_retry_at as string).toISOString()
      : null,
    responseCode: (row.response_code as number) ?? null,
  };
}
