import { GoogleGenAI } from "@google/genai";

import { logger } from "../../../logger";
import {
  GenerationPrompt,
  GenerationResult,
  LlmProviderPort,
} from "../../domain/ports/llm-provider.port";
import { classifyGeminiError, GeminiLlmProviderError } from "./gemini-error";
import { withGeminiRetry } from "./gemini-retry";

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

export class GeminiLlmProvider implements LlmProviderPort {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(prompt: GenerationPrompt): Promise<GenerationResult> {
    try {
      const response = await withGeminiRetry(
        () =>
          this.client.models.generateContent({
            model: this.model,
            contents: prompt.userContent,
            config: {
              systemInstruction: prompt.systemInstruction,
              temperature: prompt.temperature,
              maxOutputTokens: prompt.maxOutputTokens,
            },
          }),
        { attempts: RETRY_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
      );

      const content = response.text;
      if (!content) {
        throw new GeminiLlmProviderError("permanent", 500, "Gemini returned an empty response");
      }

      const usage = response.usageMetadata;

      return {
        content,
        tokensInput: usage?.promptTokenCount ?? 0,
        tokensOutput: usage?.candidatesTokenCount ?? 0,
        tokensReasoning: usage?.thoughtsTokenCount ?? 0,
      };
    } catch (error) {
      if (error instanceof GeminiLlmProviderError) {
        throw error;
      }

      const { type, statusCode, message } = classifyGeminiError(error);

      // Never log prompt.userContent (it carries a source code diff) — only
      // the provider's own error message and status.
      logger.error("Gemini generateContent failed", { type, statusCode, message });

      throw new GeminiLlmProviderError(type, statusCode, message);
    }
  }
}
