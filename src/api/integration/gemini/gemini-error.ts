export type GeminiErrorType = "transient" | "permanent";

// Carries enough for the caller (the processing use case, later) to decide
// whether a review turn failed in a recoverable way, and to log the reason
// on ReviewTurn.errorReason.
export class GeminiLlmProviderError extends Error {
  constructor(
    public readonly type: GeminiErrorType,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "GeminiLlmProviderError";
  }
}

// Status codes the Gemini API itself uses for overload/rate-limit
// conditions — worth a retry. Anything else (bad credentials, malformed
// request) is permanent.
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

export type GeminiErrorClassification = {
  type: GeminiErrorType;
  statusCode: number;
  message: string;
};

// Classifies a raw error thrown by the Gemini SDK. Falls back to matching
// the error message when no numeric status is present — the SDK's error
// shapes (and field names for things like "overloaded") have changed across
// API versions, so a network timeout or an "UNAVAILABLE"/"overloaded"
// message is still treated as transient even without one.
export function classifyGeminiError(error: unknown): GeminiErrorClassification {
  const status = extractStatus(error);
  const message = extractMessage(error);

  if (status !== undefined) {
    return {
      type: TRANSIENT_STATUS.has(status) ? "transient" : "permanent",
      statusCode: status,
      message,
    };
  }

  const looksTransient =
    /\b(429|500|502|503|504)\b|UNAVAILABLE|overloaded|high demand|rate limit|timeout/i.test(
      message,
    );
  return { type: looksTransient ? "transient" : "permanent", statusCode: 0, message };
}
