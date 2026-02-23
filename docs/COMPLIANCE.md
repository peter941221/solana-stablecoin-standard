# Compliance

## Regulatory Considerations

- Separate operational roles (minter, burner, freezer, pauser).

- On-chain blacklist with auditable history.

- Seizure flow requires explicit role and frozen account.

## Audit Log Format

Event Indexer stores every Anchor event.

JSON example

```json
{
  "event_type": "TokensMinted",
  "config_address": "3mNP...def",
  "signature": "5rTQ...ghi",
  "slot": 123456,
  "timestamp": "2025-01-15T14:30:00Z",
  "data": {
    "recipient": "9xYZ...abc",
    "amount": 1000000
  }
}
```

CSV export

```
timestamp,action,actor,target,amount,details,tx_signature
2025-01-15T14:30:00Z,MINT,9xYZ...abc,3mNP...def,1000000,,5rTQ...ghi
```

## Sanctions Screening Integration

- Compliance service can connect to external providers.

- If no provider configured, screening returns "provider_not_configured".

## Monitoring and Reporting

- Rules can be configured as simple conditions.

- Webhook alerts are delivered with signed headers.
