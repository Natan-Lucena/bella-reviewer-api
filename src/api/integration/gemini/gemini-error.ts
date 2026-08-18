import {
  classifyLlmError,
  LlmErrorClassification,
  LlmErrorType,
} from "../llm/llm-error-classification";

export type GeminiErrorType = LlmErrorType;

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

// Gemini's own wording for overload/rate-limit conditions, used as a
// fallback when the SDK's error carries no numeric status — its error
// shapes (and field names for things like "overloaded") have changed across
// API versions, so a network timeout or an "UNAVAILABLE"/"overloaded"
// message is still treated as transient even without one.
export const GEMINI_TRANSIENT_MESSAGE_PATTERN =
  /\b(429|500|502|503|504)\b|UNAVAILABLE|overloaded|high demand|rate limit|timeout/i;

export type GeminiErrorClassification = LlmErrorClassification;

export function classifyGeminiError(error: unknown): GeminiErrorClassification {
  return classifyLlmError(error, GEMINI_TRANSIENT_MESSAGE_PATTERN);
}
