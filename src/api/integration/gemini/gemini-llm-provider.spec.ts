import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import { GenerationPrompt } from "../../domain/ports/llm-provider.port";
import { GeminiLlmProviderError } from "./gemini-error";
import { GeminiLlmProvider } from "./gemini-llm-provider";

function buildPrompt(): GenerationPrompt {
  return {
    systemInstruction: "You are a code reviewer.",
    userContent: "diff content",
    temperature: 0.2,
  };
}

describe("GeminiLlmProvider", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it("returns content and token usage on success", async () => {
    generateContentMock.mockResolvedValue({
      text: "looks good",
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 },
    });
    const provider = new GeminiLlmProvider("api-key", "gemini-2.5-flash");

    const result = await provider.generate(buildPrompt());

    expect(result).toEqual({
      content: "looks good",
      tokensInput: 100,
      tokensOutput: 20,
      tokensReasoning: 5,
    });
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("defaults tokensReasoning to 0 for a non-reasoning model", async () => {
    generateContentMock.mockResolvedValue({
      text: "looks good",
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
    });
    const provider = new GeminiLlmProvider("api-key", "gemini-2.5-flash");

    const result = await provider.generate(buildPrompt());

    expect(result.tokensReasoning).toBe(0);
  });

  it("throws a permanent error when Gemini returns an empty response", async () => {
    generateContentMock.mockResolvedValue({ text: undefined, usageMetadata: {} });
    const provider = new GeminiLlmProvider("api-key", "gemini-2.5-flash");

    await expect(provider.generate(buildPrompt())).rejects.toMatchObject({
      type: "permanent",
      statusCode: 500,
    });
  });

  describe("retry behavior", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries a 429 and succeeds on the second attempt", async () => {
      generateContentMock
        .mockRejectedValueOnce({ status: 429, message: "Rate limit exceeded" })
        .mockResolvedValueOnce({
          text: "looks good",
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        });
      const provider = new GeminiLlmProvider("api-key", "gemini-2.5-flash");

      const pending = provider.generate(buildPrompt());
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.content).toBe("looks good");
      expect(generateContentMock).toHaveBeenCalledTimes(2);
    });

    it("classifies a network timeout as transient and retries", async () => {
      generateContentMock
        .mockRejectedValueOnce(new Error("connect ETIMEDOUT: request timeout"))
        .mockResolvedValueOnce({
          text: "looks good",
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        });
      const provider = new GeminiLlmProvider("api-key", "gemini-2.5-flash");

      const pending = provider.generate(buildPrompt());
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.content).toBe("looks good");
      expect(generateContentMock).toHaveBeenCalledTimes(2);
    });

    it("throws a typed transient error after exhausting retries on repeated 503s", async () => {
      generateContentMock.mockRejectedValue({ status: 503, message: "Service unavailable" });
      const provider = new GeminiLlmProvider("api-key", "gemini-2.5-flash");

      // .catch() is attached synchronously, right when the promise is
      // created — attaching it only after the timers run would leave the
      // rejection unhandled for a turn and Node would report it as such.
      const caught = provider.generate(buildPrompt()).catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toBeInstanceOf(GeminiLlmProviderError);
      expect(error).toMatchObject({ type: "transient", statusCode: 503 });
      expect(generateContentMock).toHaveBeenCalledTimes(3);
    });

    it("fails immediately on a 401, without retrying", async () => {
      generateContentMock.mockRejectedValue({ status: 401, message: "Invalid API key" });
      const provider = new GeminiLlmProvider("api-key", "gemini-2.5-flash");

      const caught = provider.generate(buildPrompt()).catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toBeInstanceOf(GeminiLlmProviderError);
      expect(error).toMatchObject({ type: "permanent", statusCode: 401 });
      expect(generateContentMock).toHaveBeenCalledTimes(1);
    });
  });
});
