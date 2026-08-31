import { LlmProvider } from "../entities/repo-config.entity";
import { LlmProviderPort } from "../ports/llm-provider.port";
import { ClaudeLlmProvider } from "../../integration/claude/claude-llm-provider";
import { GeminiLlmProvider } from "../../integration/gemini/gemini-llm-provider";
import { OpenAiLlmProvider } from "../../integration/openai/openai-llm-provider";

// Shared by every use case that needs an LlmProviderPort built from a
// RepoConfig's chosen provider/model plus an already-decrypted credential.
// Exhaustive switch over the LlmProvider union: adding a fourth provider to
// the catalog without a matching case here fails the build, not silently at
// runtime.
export function createLlmProvider(provider: LlmProvider, apiKey: string, model: string): LlmProviderPort {
  switch (provider) {
    case "gemini":
      return new GeminiLlmProvider(apiKey, model);
    case "claude":
      return new ClaudeLlmProvider(apiKey, model);
    case "openai":
      return new OpenAiLlmProvider(apiKey, model);
  }
}
