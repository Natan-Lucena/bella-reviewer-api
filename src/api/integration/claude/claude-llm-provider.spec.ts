import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  })),
}));

import { GenerationPrompt } from "../../domain/ports/llm-provider.port";
import { ClaudeLlmProviderError } from "./claude-error";
import { ClaudeLlmProvider } from "./claude-llm-provider";

function buildPrompt(overrides: Partial<GenerationPrompt> = {}): GenerationPrompt {
  return {
    systemInstruction: "You are a code reviewer.",
    userContent: "diff content",
    temperature: 0.2,
    ...overrides,
  };
}

function textResponse(text: string, usage = { input_tokens: 100, output_tokens: 20 }) {
  return { content: [{ type: "text", text }], usage };
}

describe("ClaudeLlmProvider", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("returns content and token usage on success, with tokensReasoning always 0", async () => {
    createMock.mockResolvedValue(textResponse("looks good"));
    const provider = new ClaudeLlmProvider("api-key", "claude-sonnet-4-5");

    const result = await provider.generate(buildPrompt());

    expect(result).toEqual({
      content: "looks good",
      tokensInput: 100,
      tokensOutput: 20,
      tokensReasoning: 0,
    });
  });

  it("throws a permanent error when Claude returns an empty response", async () => {
    createMock.mockResolvedValue(textResponse(""));
    const provider = new ClaudeLlmProvider("api-key", "claude-sonnet-4-5");

    await expect(provider.generate(buildPrompt())).rejects.toMatchObject({
      type: "permanent",
      statusCode: 500,
    });
  });

  describe("temperature omitted for models where sampling params are removed", () => {
    it("sends temperature for an older model", async () => {
      createMock.mockResolvedValue(textResponse("ok"));
      const provider = new ClaudeLlmProvider("api-key", "claude-sonnet-4-5");

      await provider.generate(buildPrompt({ temperature: 0.7 }));

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.7 }));
    });

    it.each(["claude-opus-5", "claude-sonnet-5", "claude-opus-4-7", "claude-opus-4-8"])(
      "omits temperature for %s",
      async (model) => {
        createMock.mockResolvedValue(textResponse("ok"));
        const provider = new ClaudeLlmProvider("api-key", model);

        await provider.generate(buildPrompt({ temperature: 0.7 }));

        const payload = createMock.mock.calls[0][0];
        expect(payload).not.toHaveProperty("temperature");
      },
    );
  });

  describe("max_tokens is always sent", () => {
    it("uses prompt.maxOutputTokens when present", async () => {
      createMock.mockResolvedValue(textResponse("ok"));
      const provider = new ClaudeLlmProvider("api-key", "claude-sonnet-4-5");

      await provider.generate(buildPrompt({ maxOutputTokens: 2048 }));

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 2048 }));
    });

    it("falls back to the default constant when maxOutputTokens is absent", async () => {
      createMock.mockResolvedValue(textResponse("ok"));
      const provider = new ClaudeLlmProvider("api-key", "claude-sonnet-4-5");

      await provider.generate(buildPrompt());

      const payload = createMock.mock.calls[0][0];
      expect(payload.max_tokens).toBeTypeOf("number");
      expect(payload.max_tokens).toBeGreaterThan(0);
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
      createMock
        .mockRejectedValueOnce({ status: 429, message: "Rate limit exceeded" })
        .mockResolvedValueOnce(textResponse("looks good", { input_tokens: 10, output_tokens: 5 }));
      const provider = new ClaudeLlmProvider("api-key", "claude-sonnet-4-5");

      const pending = provider.generate(buildPrompt());
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.content).toBe("looks good");
      expect(createMock).toHaveBeenCalledTimes(2);
    });

    it("classifies a network timeout as transient and retries", async () => {
      createMock
        .mockRejectedValueOnce(new Error("connect ETIMEDOUT: request timeout"))
        .mockResolvedValueOnce(textResponse("looks good", { input_tokens: 10, output_tokens: 5 }));
      const provider = new ClaudeLlmProvider("api-key", "claude-sonnet-4-5");

      const pending = provider.generate(buildPrompt());
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.content).toBe("looks good");
      expect(createMock).toHaveBeenCalledTimes(2);
    });

    it("throws a typed transient error after exhausting retries on repeated 503s", async () => {
      createMock.mockRejectedValue({ status: 503, message: "Overloaded" });
      const provider = new ClaudeLlmProvider("api-key", "claude-sonnet-4-5");

      // .catch() is attached synchronously, right when the promise is
      // created — attaching it only after the timers run would leave the
      // rejection unhandled for a turn and Node would report it as such.
      const caught = provider.generate(buildPrompt()).catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toBeInstanceOf(ClaudeLlmProviderError);
      expect(error).toMatchObject({ type: "transient", statusCode: 503 });
      expect(createMock).toHaveBeenCalledTimes(3);
    });

    it("fails immediately on a 401, without retrying", async () => {
      createMock.mockRejectedValue({ status: 401, message: "Invalid API key" });
      const provider = new ClaudeLlmProvider("api-key", "claude-sonnet-4-5");

      const caught = provider.generate(buildPrompt()).catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toBeInstanceOf(ClaudeLlmProviderError);
      expect(error).toMatchObject({ type: "permanent", statusCode: 401 });
      expect(createMock).toHaveBeenCalledTimes(1);
    });
  });
});
