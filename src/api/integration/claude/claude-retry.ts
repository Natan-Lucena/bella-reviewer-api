import { RetryOptions, withLlmRetry } from "../llm/llm-retry";
import { CLAUDE_TRANSIENT_MESSAGE_PATTERN } from "./claude-error";

export type { RetryOptions };

export function withClaudeRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  return withLlmRetry(fn, "Claude", CLAUDE_TRANSIENT_MESSAGE_PATTERN, options);
}
