import { createHmac } from "crypto";

import type {
  Database,
  DeliveryPayload,
} from "./db.js";
import {
  createDelivery,
  listPendingDeliveries,
  listWebhooksForEvent,
  updateDelivery,
} from "./db.js";

export interface WebhookDispatcherConfig {
  db: Database;
  maxAttempts: number;
  retryBaseSeconds: number;
  dispatchIntervalSeconds: number;
  log: (message: string, meta?: Record<string, unknown>) => void;
}

export class WebhookDispatcher {
  private readonly db: Database;
  private readonly maxAttempts: number;
  private readonly retryBaseSeconds: number;
  private readonly dispatchIntervalSeconds: number;
  private readonly log: (message: string, meta?: Record<string, unknown>) => void;
  private timer: NodeJS.Timeout | null = null;

  constructor(config: WebhookDispatcherConfig) {
    this.db = config.db;
    this.maxAttempts = config.maxAttempts;
    this.retryBaseSeconds = config.retryBaseSeconds;
    this.dispatchIntervalSeconds = config.dispatchIntervalSeconds;
    this.log = config.log;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.dispatchPending();
    }, this.dispatchIntervalSeconds * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async enqueueForEvent(eventId: number, eventType: string): Promise<void> {
    const webhooks = await listWebhooksForEvent(this.db, eventType);
    for (const webhook of webhooks) {
      await createDelivery(this.db, { webhookId: webhook.id, eventId });
    }
  }

  async dispatchPending(): Promise<void> {
    const pending = await listPendingDeliveries(this.db, this.maxAttempts, 50);
    for (const payload of pending) {
      await this.dispatch(payload);
    }
  }

  private async dispatch(payload: DeliveryPayload): Promise<void> {
    const { delivery, webhook, event } = payload;
    const body = JSON.stringify({
      event: event.eventType,
      timestamp: event.timestamp,
      data: event.data,
      signature: event.signature,
    });
    const signature = createSignature(webhook.secret, body);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-SSS-Signature": `sha256=${signature}`,
      "X-SSS-Event": event.eventType,
      "X-SSS-Delivery": delivery.id.toString(),
    };

    let status = "delivered";
    let responseCode: number | null = null;
    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body,
      });
      responseCode = response.status;
      if (!response.ok) {
        status = "failed";
      }
    } catch (error) {
      status = "failed";
      this.log("webhook delivery error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const nextAttempt = delivery.attempts + 1;
    const nextRetryAt =
      status === "failed" && nextAttempt < this.maxAttempts
        ? new Date(Date.now() + this.retryBaseSeconds * 1000 * 2 ** delivery.attempts)
        : null;

    await updateDelivery(this.db, {
      id: delivery.id,
      status,
      attempts: nextAttempt,
      lastAttemptAt: new Date(),
      nextRetryAt,
      responseCode,
    });
  }
}

function createSignature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}
