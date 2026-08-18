export type LlmErrorType = "transient" | "permanent";

export type LlmErrorClassification = {
  type: LlmErrorType;
  statusCode: number;
  message: string;
};

// Status codes every LLM provider's API uses for overload/rate-limit
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

// Shared classification logic for every LLM provider adapter
// (Gemini/Claude/OpenAI, `../<provider>/<provider>-error.ts`). A numeric
// HTTP status, when present, is authoritative. Otherwise falls back to
// matching the error message against `transientMessagePattern` — each
// provider's own wording for overload/rate-limit conditions, needed because
// a network timeout (or an SDK error shape that changed across API
// versions) never reaches the API to get a status at all.
export function classifyLlmError(
  error: unknown,
  transientMessagePattern: RegExp,
): LlmErrorClassification {
  const status = extractStatus(error);
  const message = extractMessage(error);

  if (status !== undefined) {
    return {
      type: TRANSIENT_STATUS.has(status) ? "transient" : "permanent",
      statusCode: status,
      message,
    };
  }

  return {
    type: transientMessagePattern.test(message) ? "transient" : "permanent",
    statusCode: 0,
    message,
  };
}
