import { RetryOptions, withLlmRetry } from "../llm/llm-retry";
import { OPENAI_TRANSIENT_MESSAGE_PATTERN } from "./openai-error";

export type { RetryOptions };

export function withOpenAiRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  return withLlmRetry(fn, "OpenAI", OPENAI_TRANSIENT_MESSAGE_PATTERN, options);
}
