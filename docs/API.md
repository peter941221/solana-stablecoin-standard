# API Reference

## Mint and Burn Service (port 3001)

Endpoints

- POST /api/v1/mint

- POST /api/v1/burn

- GET /api/v1/supply

- GET /api/v1/operations

- GET /api/v1/health

Example: mint

```json
{
  "recipient": "9xYZ...abc",
  "amount": 1000000,
  "memo": "Customer deposit"
}
```

Response

```json
{
  "success": true,
  "signature": "5rTQ...ghi",
  "supply": 10000000,
  "timestamp": "2025-01-15T14:30:00Z"
}
```

Auth and Idempotency

- Authorization: Bearer <api-key>

- X-Idempotency-Key: <uuid>

## Event Indexer (port 3002)

Endpoints

- GET /api/v1/events

- GET /api/v1/events/stream

- POST /api/v1/webhooks

- DELETE /api/v1/webhooks/:id

Webhook payload

```json
{
  "event": "TokensMinted",
  "timestamp": "2025-01-15T14:30:00Z",
  "data": {},
  "signature": "5rTQ...ghi"
}
```

## Compliance Service (port 3003)

Endpoints

- POST /api/v1/screening/check

- GET /api/v1/blacklist

- POST /api/v1/blacklist/add

- POST /api/v1/blacklist/remove

- GET /api/v1/audit/export

- POST /api/v1/monitoring/rules

Screening response

```json
{
  "address": "9xYZ...abc",
  "riskLevel": "low",
  "isBlacklisted": false,
  "sanctions": {
    "ofac": false,
    "eu": false
  },
  "checkedAt": "2025-01-15T14:30:00Z"
}
```
