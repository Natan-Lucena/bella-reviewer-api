export type OpenAiErrorType = "transient" | "permanent";

// Carries enough for the caller (the processing use case, later) to decide
// whether a review turn failed in a recoverable way, and to log the reason
// on ReviewTurn.errorReason.
export class OpenAiLlmProviderError extends Error {
  constructor(
    public readonly type: OpenAiErrorType,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenAiLlmProviderError";
  }
}

// Status codes the OpenAI API itself uses for overload/rate-limit
// conditions — worth a retry. Anything else (bad credentials, malformed
// request, including an unsupported parameter for the chosen model) is
// permanent.
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

export type OpenAiErrorClassification = {
  type: OpenAiErrorType;
  statusCode: number;
  message: string;
};

// Classifies a raw error thrown by the OpenAI SDK. Falls back to matching
// the error message when no numeric status is present (e.g. a network
// timeout, which never reaches the API to get a status at all).
export function classifyOpenAiError(error: unknown): OpenAiErrorClassification {
  const status = extractStatus(error);
  const message = extractMessage(error);

  if (status !== undefined) {
    return {
      type: TRANSIENT_STATUS.has(status) ? "transient" : "permanent",
      statusCode: status,
      message,
    };
  }

  const looksTransient = /\b(429|500|502|503|504)\b|overloaded|rate limit|timeout/i.test(message);
  return { type: looksTransient ? "transient" : "permanent", statusCode: 0, message };
}
