import {
  classifyLlmError,
  LlmErrorClassification,
  LlmErrorType,
} from "../llm/llm-error-classification";

export type ClaudeErrorType = LlmErrorType;

// Carries enough for the caller (the processing use case, later) to decide
// whether a review turn failed in a recoverable way, and to log the reason
// on ReviewTurn.errorReason.
export class ClaudeLlmProviderError extends Error {
  constructor(
    public readonly type: ClaudeErrorType,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ClaudeLlmProviderError";
  }
}

// Claude's own wording for overload/rate-limit conditions, used as a
// fallback when the SDK's error carries no numeric status (e.g. a network
// timeout, which never reaches the API to get a status at all).
export const CLAUDE_TRANSIENT_MESSAGE_PATTERN =
  /\b(429|500|502|503|504)\b|overloaded|rate limit|timeout/i;

export type ClaudeErrorClassification = LlmErrorClassification;

export function classifyClaudeError(error: unknown): ClaudeErrorClassification {
  return classifyLlmError(error, CLAUDE_TRANSIENT_MESSAGE_PATTERN);
}
