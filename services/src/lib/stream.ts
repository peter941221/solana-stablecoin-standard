import type { FastifyReply, FastifyRequest } from "fastify";

export class EventStream {
  private readonly clients = new Set<NodeJS.WritableStream>();

  add(reply: FastifyReply, request: FastifyRequest): void {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.write("event: ready\n");
    reply.raw.write("data: {\"status\":\"connected\"}\n\n");
    this.clients.add(reply.raw);

    const keepAlive = setInterval(() => {
      reply.raw.write(": keepalive\n\n");
    }, 15000);

    request.raw.on("close", () => {
      clearInterval(keepAlive);
      this.clients.delete(reply.raw);
    });

    reply.hijack();
  }

  broadcast(eventName: string, payload: unknown): void {
    const data = JSON.stringify(payload);
    for (const client of this.clients) {
      client.write(`event: ${eventName}\n`);
      client.write(`data: ${data}\n\n`);
    }
  }
}
