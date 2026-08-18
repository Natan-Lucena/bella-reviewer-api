import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } },
  })),
}));

import { GenerationPrompt } from "../../domain/ports/llm-provider.port";
import { OpenAiLlmProviderError } from "./openai-error";
import { OpenAiLlmProvider } from "./openai-llm-provider";

function buildPrompt(overrides: Partial<GenerationPrompt> = {}): GenerationPrompt {
  return {
    systemInstruction: "You are a code reviewer.",
    userContent: "diff content",
    temperature: 0.2,
    ...overrides,
  };
}

function chatResponse(
  content: string,
  usage: { prompt_tokens: number; completion_tokens: number; reasoning_tokens?: number } = {
    prompt_tokens: 100,
    completion_tokens: 20,
  },
) {
  return {
    choices: [{ message: { content } }],
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      ...(usage.reasoning_tokens === undefined
        ? {}
        : { completion_tokens_details: { reasoning_tokens: usage.reasoning_tokens } }),
    },
  };
}

describe("OpenAiLlmProvider", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("returns content and token usage on success", async () => {
    createMock.mockResolvedValue(chatResponse("looks good"));
    const provider = new OpenAiLlmProvider("api-key", "gpt-5-mini");

    const result = await provider.generate(buildPrompt());

    expect(result).toEqual({
      content: "looks good",
      tokensInput: 100,
      tokensOutput: 20,
      tokensReasoning: 0,
    });
  });

  it("reads tokensReasoning from completion_tokens_details when present", async () => {
    createMock.mockResolvedValue(
      chatResponse("looks good", {
        prompt_tokens: 100,
        completion_tokens: 20,
        reasoning_tokens: 40,
      }),
    );
    const provider = new OpenAiLlmProvider("api-key", "o3");

    const result = await provider.generate(buildPrompt());

    expect(result.tokensReasoning).toBe(40);
  });

  it("throws a permanent error when OpenAI returns an empty response", async () => {
    createMock.mockResolvedValue(chatResponse(""));
    const provider = new OpenAiLlmProvider("api-key", "gpt-5-mini");

    await expect(provider.generate(buildPrompt())).rejects.toMatchObject({
      type: "permanent",
      statusCode: 500,
    });
  });

  describe("temperature omitted for reasoning models", () => {
    it("sends temperature for a non-reasoning model", async () => {
      createMock.mockResolvedValue(chatResponse("ok"));
      const provider = new OpenAiLlmProvider("api-key", "gpt-5-mini");

      await provider.generate(buildPrompt({ temperature: 0.7 }));

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.7 }));
    });

    it.each(["o1", "o3", "gpt-5-thinking"])(
      "omits temperature for reasoning model %s",
      async (model) => {
        createMock.mockResolvedValue(chatResponse("ok"));
        const provider = new OpenAiLlmProvider("api-key", model);

        await provider.generate(buildPrompt({ temperature: 0.7 }));

        const payload = createMock.mock.calls[0][0];
        expect(payload).not.toHaveProperty("temperature");
      },
    );

    it("sends max_completion_tokens instead of max_tokens for a reasoning model", async () => {
      createMock.mockResolvedValue(chatResponse("ok"));
      const provider = new OpenAiLlmProvider("api-key", "o3");

      await provider.generate(buildPrompt({ maxOutputTokens: 2048 }));

      const payload = createMock.mock.calls[0][0];
      expect(payload.max_completion_tokens).toBe(2048);
      expect(payload).not.toHaveProperty("max_tokens");
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
        .mockResolvedValueOnce(
          chatResponse("looks good", { prompt_tokens: 10, completion_tokens: 5 }),
        );
      const provider = new OpenAiLlmProvider("api-key", "gpt-5-mini");

      const pending = provider.generate(buildPrompt());
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.content).toBe("looks good");
      expect(createMock).toHaveBeenCalledTimes(2);
    });

    it("classifies a network timeout as transient and retries", async () => {
      createMock
        .mockRejectedValueOnce(new Error("connect ETIMEDOUT: request timeout"))
        .mockResolvedValueOnce(
          chatResponse("looks good", { prompt_tokens: 10, completion_tokens: 5 }),
        );
      const provider = new OpenAiLlmProvider("api-key", "gpt-5-mini");

      const pending = provider.generate(buildPrompt());
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.content).toBe("looks good");
      expect(createMock).toHaveBeenCalledTimes(2);
    });

    it("throws a typed transient error after exhausting retries on repeated 503s", async () => {
      createMock.mockRejectedValue({ status: 503, message: "Overloaded" });
      const provider = new OpenAiLlmProvider("api-key", "gpt-5-mini");

      // .catch() is attached synchronously, right when the promise is
      // created — attaching it only after the timers run would leave the
      // rejection unhandled for a turn and Node would report it as such.
      const caught = provider.generate(buildPrompt()).catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toBeInstanceOf(OpenAiLlmProviderError);
      expect(error).toMatchObject({ type: "transient", statusCode: 503 });
      expect(createMock).toHaveBeenCalledTimes(3);
    });

    it("fails immediately on a 401, without retrying", async () => {
      createMock.mockRejectedValue({ status: 401, message: "Invalid API key" });
      const provider = new OpenAiLlmProvider("api-key", "gpt-5-mini");

      const caught = provider.generate(buildPrompt()).catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toBeInstanceOf(OpenAiLlmProviderError);
      expect(error).toMatchObject({ type: "permanent", statusCode: 401 });
      expect(createMock).toHaveBeenCalledTimes(1);
    });
  });
});
