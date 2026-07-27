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
    // QStash's publish endpoint takes the destination URL as part of its own
    // path — it must be URL-encoded since it's a full URL, not a path segment.
    const publishUrl = `${this.baseUrl}/v2/publish/${encodeURIComponent(params.url)}`;

    const response = await fetch(publishUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
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
