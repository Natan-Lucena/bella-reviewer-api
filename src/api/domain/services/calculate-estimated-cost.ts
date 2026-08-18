import { LlmProvider } from "../entities/repo-config.entity";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export type ModelPricing = { inputPerMillionTokens: number; outputPerMillionTokens: number };

// USD per 1M tokens, standard (non-batch) API pricing. LLM provider pricing
// changes over time — re-verify against each provider's live pricing page
// before trusting these numbers long after the date noted per provider.
export const MODEL_PRICING: Record<LlmProvider, Record<string, ModelPricing>> = {
  // Source: https://ai.google.dev/gemini-api/docs/pricing, verified 2026-08-06.
  // Gemini 2.5 Pro's real pricing is tiered by prompt size (a higher rate
  // above 200k input tokens) — not modeled here. RepoConfig.tokenLimit
  // defaults to 100,000 and a diff that exceeds the configured limit already
  // fails the review before generation starts (see review-service.ts), so
  // the >200k tier only matters for a repo explicitly configured with a much
  // higher limit.
  gemini: {
    "gemini-2.5-flash": { inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 },
    "gemini-2.5-pro": { inputPerMillionTokens: 1.25, outputPerMillionTokens: 10.0 },
  },
  // Source: https://platform.claude.com/docs/en/about-claude/pricing,
  // verified 2026-08-18. claude-opus-4-1 is listed there as retired from
  // direct API access (available only via Bedrock/Google Cloud as of this
  // date) — kept here because ClaudeLlmProvider still targets the direct
  // API and the catalog (23-catalogo-de-provedores-llm.md) still lists it as
  // a known model; worth revisiting whether it should be dropped from the
  // catalog in a follow-up, out of scope for this cost table itself.
  claude: {
    "claude-sonnet-4-5": { inputPerMillionTokens: 3.0, outputPerMillionTokens: 15.0 },
    "claude-opus-4-1": { inputPerMillionTokens: 15.0, outputPerMillionTokens: 75.0 },
    "claude-haiku-4-5": { inputPerMillionTokens: 1.0, outputPerMillionTokens: 5.0 },
  },
  // Source: https://developers.openai.com/api/docs/pricing, verified
  // 2026-08-18.
  openai: {
    "gpt-5": { inputPerMillionTokens: 1.25, outputPerMillionTokens: 10.0 },
    "gpt-5-mini": { inputPerMillionTokens: 0.25, outputPerMillionTokens: 2.0 },
    "gpt-4o": { inputPerMillionTokens: 2.5, outputPerMillionTokens: 10.0 },
  },
};

// Returns null (never 0) for a model outside the table above — an unknown
// cost should never be indistinguishable from a genuinely free one. `provider`
// itself is never invalid at runtime for a valid RepoConfig — LlmProvider is a
// closed string-literal union (23-catalogo-de-provedores-llm.md), so
// MODEL_PRICING[provider] is always defined; only `model` is free-form and can
// miss the table.
export function calculateEstimatedCost(
  provider: LlmProvider,
  model: string,
  usage: TokenUsage,
): number | null {
  const pricing = MODEL_PRICING[provider][model];
  if (!pricing) {
    return null;
  }

  // Reasoning/thinking tokens are billed at the same rate as regular output
  // tokens by all three providers today — see the note in
  // 26-custo-multi-provedor.md for the per-provider confirmation (Gemini
  // thinking tokens, OpenAI reasoning_tokens; Claude extended thinking isn't
  // enabled by ClaudeLlmProvider yet, so tokensReasoning is always 0 for it).
  const outputTokensBilled = usage.outputTokens + usage.reasoningTokens;

  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillionTokens +
    (outputTokensBilled / 1_000_000) * pricing.outputPerMillionTokens
  );
}
