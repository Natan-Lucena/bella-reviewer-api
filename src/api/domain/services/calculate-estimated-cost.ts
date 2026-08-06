export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

// USD per 1M tokens, paid tier, standard (non-batch, ≤200k-token-prompt)
// pricing. Source: https://ai.google.dev/gemini-api/docs/pricing, verified
// 2026-08-06 — LLM provider pricing changes over time, re-verify against the
// live page before trusting these numbers long after that date.
//
// Gemini 2.5 Pro's real pricing is tiered by prompt size (a higher rate above
// 200k input tokens) — not modeled here. RepoConfig.tokenLimit defaults to
// 100,000 and a diff that exceeds the configured limit already fails the
// review before generation starts (see review-service.ts), so the >200k tier
// only matters for a repo explicitly configured with a much higher limit.
export const GEMINI_MODEL_PRICING: Record<
  string,
  { inputPerMillionTokens: number; outputPerMillionTokens: number }
> = {
  "gemini-2.5-flash": { inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 },
  "gemini-2.5-pro": { inputPerMillionTokens: 1.25, outputPerMillionTokens: 10.0 },
};

// Returns null (never 0) for a model outside the table above — an unknown
// cost should never be indistinguishable from a genuinely free one.
export function calculateEstimatedCost(model: string, usage: TokenUsage): number | null {
  const pricing = GEMINI_MODEL_PRICING[model];
  if (!pricing) {
    return null;
  }

  // Gemini bills thinking/reasoning tokens at the same rate as regular
  // output tokens — no separate price tier for them.
  const outputTokensBilled = usage.outputTokens + usage.reasoningTokens;

  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillionTokens +
    (outputTokensBilled / 1_000_000) * pricing.outputPerMillionTokens
  );
}
