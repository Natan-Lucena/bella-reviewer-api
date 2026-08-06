import { describe, expect, it } from "vitest";

import { calculateEstimatedCost } from "./calculate-estimated-cost";

describe("calculateEstimatedCost", () => {
  it("computes cost for a known model, billing reasoning tokens at the output rate", () => {
    const cost = calculateEstimatedCost("gemini-2.5-flash", {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      reasoningTokens: 500_000,
    });

    // input: 1M * 0.30 = 0.30
    // output+reasoning: 1M * 2.50 = 2.50
    expect(cost).toBeCloseTo(2.8, 10);
  });

  it("computes a different total for a different known model", () => {
    const cost = calculateEstimatedCost("gemini-2.5-pro", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningTokens: 0,
    });

    // input: 1M * 1.25 = 1.25
    // output: 1M * 10.00 = 10.00
    expect(cost).toBeCloseTo(11.25, 10);
  });

  it("returns null (never 0) for a model outside the pricing table", () => {
    const cost = calculateEstimatedCost("some-future-model", {
      inputTokens: 1000,
      outputTokens: 1000,
      reasoningTokens: 0,
    });

    expect(cost).toBeNull();
  });

  it("returns 0 for a known model with zero token usage", () => {
    const cost = calculateEstimatedCost("gemini-2.5-flash", {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
    });

    expect(cost).toBe(0);
  });
});
