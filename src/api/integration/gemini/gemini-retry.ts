import { RetryOptions, withLlmRetry } from "../llm/llm-retry";
import { GEMINI_TRANSIENT_MESSAGE_PATTERN } from "./gemini-error";

export type { RetryOptions };

export function withGeminiRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  return withLlmRetry(fn, "Gemini", GEMINI_TRANSIENT_MESSAGE_PATTERN, options);
}
