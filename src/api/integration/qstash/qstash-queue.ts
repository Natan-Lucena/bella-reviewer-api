import axios, { AxiosInstance } from "axios";

import { logger } from "../../../logger";
import { PublishMessageParams, QueuePort } from "../../domain/ports/queue.port";
import { classifyQstashError, QstashQueueError } from "./qstash-error";
import { withQstashRetry } from "./qstash-retry";

const REQUEST_TIMEOUT_MS = 15000;

export class QstashQueue implements QueuePort {
  private readonly http: AxiosInstance;

  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
  ) {
    this.http = axios.create({ timeout: REQUEST_TIMEOUT_MS });
  }

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

    try {
      await this.http.request({
        url: publishUrl,
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...forwardedHeaders,
        },
        data: params.body,
      });
    } catch (error) {
      // axios rejects with an error carrying a `response` property when the
      // server answered with a non-2xx status — normalized here to the same
      // {status, message} shape this class threw before migrating off raw
      // fetch(), so classifyQstashError needs no changes. A request that
      // never got a response at all (network error, our own timeout) has no
      // `.response` and is rethrown as-is; its `.message` still drives the
      // transient/permanent classification there.
      const axiosError = error as { response?: { status?: number; data?: { message?: string } } };
      if (axiosError?.response) {
        throw {
          status: axiosError.response.status,
          message: axiosError.response.data?.message ?? (error as Error).message,
        };
      }
      throw error;
    }
  }
}
