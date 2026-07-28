import { logger } from "../../../logger";
import { PublishMessageParams, QueuePort } from "../../domain/ports/queue.port";
import { classifyQstashError, QstashQueueError } from "./qstash-error";
import { withQstashRetry } from "./qstash-retry";

const REQUEST_TIMEOUT_MS = 15000;

export class QstashQueue implements QueuePort {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
  ) {}

  async publish(params: PublishMessageParams): Promise<void> {
    try {
      await withQstashRetry(() => this.request(params));
    } catch (error) {
      if (error instanceof QstashQueueError) {
        throw error;
      }

      const { type, statusCode, message } = classifyQstashError(error);

      // Never log params.body (the queued review-run payload carries the
      // diff) — only the provider's own error message and status.
      logger.error("QStash publish failed", { type, statusCode, message });

      throw new QstashQueueError(type, statusCode, message);
    }
  }

  private async request(params: PublishMessageParams): Promise<void> {
    // QStash's publish endpoint takes the destination URL appended directly
    // after /v2/publish/ — NOT URL-encoded. QStash parses everything past
    // that prefix as the destination itself; encoding it breaks the parse
    // and QStash responds 400.
    const publishUrl = `${this.baseUrl}/v2/publish/${params.url}`;

    // Headers prefixed Upstash-Forward- are stripped of that prefix and
    // forwarded as-is to the destination when QStash calls it back — this is
    // how a caller-supplied header (e.g. an internal auth token) reaches the
    // destination endpoint.
    const forwardedHeaders = Object.fromEntries(
      Object.entries(params.headers ?? {}).map(([key, value]) => [`Upstash-Forward-${key}`, value]),
    );

    const response = await fetch(publishUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...forwardedHeaders,
      },
      body: JSON.stringify(params.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw { status: response.status, message: body?.message ?? response.statusText };
    }
  }
}
