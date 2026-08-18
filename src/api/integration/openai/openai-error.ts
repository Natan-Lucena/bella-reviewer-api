import {
  classifyLlmError,
  LlmErrorClassification,
  LlmErrorType,
} from "../llm/llm-error-classification";

export type OpenAiErrorType = LlmErrorType;

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

// OpenAI's own wording for overload/rate-limit conditions, used as a
// fallback when the SDK's error carries no numeric status (e.g. a network
// timeout, which never reaches the API to get a status at all).
export const OPENAI_TRANSIENT_MESSAGE_PATTERN =
  /\b(429|500|502|503|504)\b|overloaded|rate limit|timeout/i;

export type OpenAiErrorClassification = LlmErrorClassification;

export function classifyOpenAiError(error: unknown): OpenAiErrorClassification {
  return classifyLlmError(error, OPENAI_TRANSIENT_MESSAGE_PATTERN);
}
