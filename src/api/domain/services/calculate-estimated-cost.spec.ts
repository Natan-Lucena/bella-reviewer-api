import { describe, expect, it } from "vitest";

import { calculateEstimatedCost } from "./calculate-estimated-cost";

describe("calculateEstimatedCost", () => {
  it("computes cost for a known model, billing reasoning tokens at the output rate", () => {
    const cost = calculateEstimatedCost("gemini", "gemini-2.5-flash", {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      reasoningTokens: 500_000,
    });

    // input: 1M * 0.30 = 0.30
    // output+reasoning: 1M * 2.50 = 2.50
    expect(cost).toBeCloseTo(2.8, 10);
  });

  it("computes a different total for a different known model of the same provider", () => {
    const cost = calculateEstimatedCost("gemini", "gemini-2.5-pro", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningTokens: 0,
    });

    // input: 1M * 1.25 = 1.25
    // output: 1M * 10.00 = 10.00
    expect(cost).toBeCloseTo(11.25, 10);
  });

  it("resolves the same model-name-shaped string to a different price under a different provider", () => {
    // Not a real cross-provider collision today, but the reason this PRD
    // exists: the price table is keyed by provider first, model second, so a
    // model string never resolves against the wrong provider's table.
    const geminiCost = calculateEstimatedCost("gemini", "gemini-2.5-flash", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningTokens: 0,
    });
    const claudeCost = calculateEstimatedCost("claude", "claude-sonnet-4-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningTokens: 0,
    });

    expect(geminiCost).not.toBeNull();
    expect(claudeCost).not.toBeNull();
    expect(geminiCost).not.toBe(claudeCost);
  });

  it("computes cost for a known Claude model", () => {
    const cost = calculateEstimatedCost("claude", "claude-haiku-4-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningTokens: 0,
    });

    // input: 1M * 1.00 = 1.00
    // output: 1M * 5.00 = 5.00
    expect(cost).toBeCloseTo(6.0, 10);
  });

  it("computes cost for a known OpenAI model, billing reasoning tokens at the output rate", () => {
    const cost = calculateEstimatedCost("openai", "gpt-5", {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      reasoningTokens: 500_000,
    });

    // input: 1M * 1.25 = 1.25
    // output+reasoning: 1M * 10.00 = 10.00
    expect(cost).toBeCloseTo(11.25, 10);
  });

  it("returns null (never 0) for a model outside the pricing table, for a valid provider", () => {
    const cost = calculateEstimatedCost("gemini", "some-future-model", {
      inputTokens: 1000,
      outputTokens: 1000,
      reasoningTokens: 0,
    });

    expect(cost).toBeNull();
  });

  it("returns 0 for a known model with zero token usage", () => {
    const cost = calculateEstimatedCost("gemini", "gemini-2.5-flash", {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
    });

    expect(cost).toBe(0);
  });
});
