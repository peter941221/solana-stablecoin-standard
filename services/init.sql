CREATE TABLE IF NOT EXISTS operations (
  id SERIAL PRIMARY KEY,
  operation_type VARCHAR(20) NOT NULL,
  address VARCHAR(64) NOT NULL,
  amount BIGINT NOT NULL,
  memo TEXT,
  signature VARCHAR(128),
  idempotency_key VARCHAR(128),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(operation_type);
CREATE INDEX IF NOT EXISTS idx_operations_created ON operations(created_at);
CREATE INDEX IF NOT EXISTS idx_operations_idempotency ON operations(idempotency_key);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  config_address VARCHAR(64) NOT NULL,
  signature VARCHAR(128) NOT NULL UNIQUE,
  slot BIGINT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_config ON events(config_address);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  url VARCHAR(500) NOT NULL,
  event_types TEXT[] NOT NULL,
  secret VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id SERIAL PRIMARY KEY,
  webhook_id INTEGER REFERENCES webhooks(id),
  event_id INTEGER REFERENCES events(id),
  status VARCHAR(20) NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  response_code INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  condition TEXT NOT NULL,
  action VARCHAR(50) NOT NULL,
  webhook_url VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexer_state (
  id INTEGER PRIMARY KEY,
  last_slot BIGINT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
