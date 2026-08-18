import { LlmProvider } from "../entities/repo-config.entity";

export type LlmProviderCatalogEntry = {
  provider: LlmProvider;
  // Model used when the client configures a credential without specifying a
  // model explicitly — needs to be a valid key in the cost pricing table.
  defaultModel: string;
  // Models known at the time this catalog was written — a suggestion/UX
  // list only (mirrored in the frontend catalog as autocomplete), never an
  // allowlist enforced by the backend. A model a provider ships after this
  // catalog was written is still accepted in RepoConfig.model (free-form
  // string) — it just doesn't show up as a suggestion until the catalog is
  // updated, same reasoning as "unknown model doesn't fail the run" for
  // cost calculation.
  knownModels: string[];
};

// Model names/versions change over time — re-verify against each
// provider's docs before trusting these long after they were written.
export const LLM_PROVIDER_CATALOG: Record<LlmProvider, LlmProviderCatalogEntry> = {
  gemini: {
    provider: "gemini",
    defaultModel: "gemini-2.5-flash",
    knownModels: ["gemini-2.5-flash", "gemini-2.5-pro"],
  },
  claude: {
    provider: "claude",
    defaultModel: "claude-sonnet-4-5",
    knownModels: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
  },
  openai: {
    provider: "openai",
    defaultModel: "gpt-5",
    knownModels: ["gpt-5", "gpt-5-mini", "gpt-4o"],
  },
};

export function getDefaultModelForProvider(provider: LlmProvider): string {
  return LLM_PROVIDER_CATALOG[provider].defaultModel;
}
