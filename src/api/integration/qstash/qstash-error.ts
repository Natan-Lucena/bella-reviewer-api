export type QstashErrorType = "transient" | "permanent";

// Carries enough for the caller (the ingestion use case) to decide whether
// enqueueing a review run failed in a recoverable way.
export class QstashQueueError extends Error {
  constructor(
    public readonly type: QstashErrorType,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "QstashQueueError";
  }
}

// Worth a retry: rate limiting and the provider's own transient failures.
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

function extractStatus(error: unknown): number | undefined {
  const status = (error as { status?: number })?.status;
  return typeof status === "number" ? status : undefined;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const message = (error as { message?: string })?.message;
  return typeof message === "string" ? message : String(error);
}

export type QstashErrorClassification = {
  type: QstashErrorType;
  statusCode: number;
  message: string;
};

// Classifies a raw error from a QStash API call. Anything with a status code
// QStash itself uses for overload/rate-limit is transient; every other
// status (401/403 bad token, 400 malformed request) is permanent. A request
// that never got an HTTP response at all (network error, our own request
// timeout aborting it) falls back to matching the error message.
export function classifyQstashError(error: unknown): QstashErrorClassification {
  const status = extractStatus(error);
  const message = extractMessage(error);

  if (status !== undefined) {
    return {
      type: TRANSIENT_STATUS.has(status) ? "transient" : "permanent",
      statusCode: status,
      message,
    };
  }

  const looksTransient = /timeout|timed out|aborted|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i.test(
    message,
  );
  return { type: looksTransient ? "transient" : "permanent", statusCode: 0, message };
}
