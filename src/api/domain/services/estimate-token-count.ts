// Conservative estimate, not an exact tokenizer count — good enough to
// decide "does this fit the configured budget" before spending anything on
// a real LLM call.
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
