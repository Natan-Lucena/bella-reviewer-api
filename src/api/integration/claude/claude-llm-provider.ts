import Anthropic from "@anthropic-ai/sdk";

import { logger } from "../../../logger";
import {
  GenerationPrompt,
  GenerationResult,
  LlmProviderPort,
} from "../../domain/ports/llm-provider.port";
import { ClaudeLlmProviderError, classifyClaudeError } from "./claude-error";
import { withClaudeRetry } from "./claude-retry";

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

// The Anthropic Messages API rejects a request that omits max_tokens — there
// is no implicit default like Gemini's. Used only when
// GenerationPrompt.maxOutputTokens is left unset by the caller. Conservative
// across the current Claude model family — re-check against the specific
// model's real output ceiling if this is ever raised.
const CLAUDE_DEFAULT_MAX_OUTPUT_TOKENS = 8192;

export class ClaudeLlmProvider implements LlmProviderPort {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(prompt: GenerationPrompt): Promise<GenerationResult> {
    try {
      const response = await withClaudeRetry(
        () =>
          this.client.messages.create({
            model: this.model,
            system: prompt.systemInstruction,
            messages: [{ role: "user", content: prompt.userContent }],
            temperature: prompt.temperature,
            max_tokens: prompt.maxOutputTokens ?? CLAUDE_DEFAULT_MAX_OUTPUT_TOKENS,
          }),
        { attempts: RETRY_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      );

      const content = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (!content) {
        throw new ClaudeLlmProviderError("permanent", 500, "Claude returned an empty response");
      }

      return {
        content,
        tokensInput: response.usage.input_tokens,
        tokensOutput: response.usage.output_tokens,
        // Extended thinking is not enabled by this provider — Claude has no
        // separate reasoning-token count to report while it's off.
        tokensReasoning: 0,
      };
    } catch (error) {
      if (error instanceof ClaudeLlmProviderError) {
        throw error;
      }

      const { type, statusCode, message } = classifyClaudeError(error);

      // Never log prompt.userContent (it carries a source code diff) — only
      // the provider's own error message and status.
      logger.error("Claude messages.create failed", { type, statusCode, message });

      throw new ClaudeLlmProviderError(type, statusCode, message);
    }
  }
}
