import OpenAI from "openai";

import { logger } from "../../../logger";
import {
  GenerationPrompt,
  GenerationResult,
  LlmProviderPort,
} from "../../domain/ports/llm-provider.port";
import { classifyOpenAiError, OpenAiLlmProviderError } from "./openai-error";
import { withOpenAiRetry } from "./openai-retry";

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

// OpenAI's reasoning-model family (the "o" prefix, and gpt-5's reasoning
// variant) only accepts the default temperature — sending a custom value
// causes a 400 on those models specifically. Re-check against OpenAI's
// current model naming before relying on this if the prefix convention
// changes.
function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5-thinking)/.test(model);
}

export class OpenAiLlmProvider implements LlmProviderPort {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(prompt: GenerationPrompt): Promise<GenerationResult> {
    try {
      const reasoning = isReasoningModel(this.model);

      const response = await withOpenAiRetry(
        () =>
          this.client.chat.completions.create({
            model: this.model,
            messages: [
              { role: "system", content: prompt.systemInstruction },
              { role: "user", content: prompt.userContent },
            ],
            ...(reasoning ? {} : { temperature: prompt.temperature }),
            // max_tokens is deprecated and rejected by reasoning models —
            // they require max_completion_tokens instead. Both are only
            // sent when the caller specifies a limit; the API applies its
            // own default otherwise.
            ...(prompt.maxOutputTokens === undefined
              ? {}
              : reasoning
                ? { max_completion_tokens: prompt.maxOutputTokens }
                : { max_tokens: prompt.maxOutputTokens }),
          }),
        { attempts: RETRY_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      );

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new OpenAiLlmProviderError("permanent", 500, "OpenAI returned an empty response");
      }

      const usage = response.usage;

      return {
        content,
        tokensInput: usage?.prompt_tokens ?? 0,
        tokensOutput: usage?.completion_tokens ?? 0,
        // completion_tokens_details is only present for reasoning models —
        // its absence for a non-reasoning model is expected, not an error.
        tokensReasoning: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof OpenAiLlmProviderError) {
        throw error;
      }

      const { type, statusCode, message } = classifyOpenAiError(error);

      // Never log prompt.userContent (it carries a source code diff) — only
      // the provider's own error message and status.
      logger.error("OpenAI chat.completions.create failed", { type, statusCode, message });

      throw new OpenAiLlmProviderError(type, statusCode, message);
    }
  }
}
