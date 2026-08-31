import { describe, expect, it } from "vitest";

import { attributeCommentCost } from "./attribute-comment-cost";

const turnTokens = { inputTokens: 1000, outputTokens: 500, reasoningTokens: 200 };

describe("attributeCommentCost", () => {
  it("returns an empty array for an empty comments array", () => {
    expect(attributeCommentCost([], turnTokens)).toEqual([]);
  });

  it("splits input tokens evenly across comments regardless of body size", () => {
    const result = attributeCommentCost(
      [
        { body: "short", suggestedCode: null },
        { body: "a much, much longer body than the other one", suggestedCode: null },
      ],
      turnTokens,
    );

    expect(result[0]?.inputTokens).toBe(500);
    expect(result[1]?.inputTokens).toBe(500);
  });

  it("gives a comment with a large suggestedCode a proportionally larger output/reasoning share", () => {
    const [short, long] = attributeCommentCost(
      [
        { body: "Looks fine.", suggestedCode: null },
        { body: "Looks fine.", suggestedCode: "x".repeat(1000) },
      ],
      turnTokens,
    );

    expect(long!.outputTokens).toBeGreaterThan(short!.outputTokens);
    expect(long!.reasoningTokens).toBeGreaterThan(short!.reasoningTokens);
    // Weights are 11 vs 1011 — the long comment should carry almost the
    // entire turn's output/reasoning share.
    expect(long!.outputTokens).toBeGreaterThan(turnTokens.outputTokens * 0.9);
    expect(long!.reasoningTokens).toBeGreaterThan(turnTokens.reasoningTokens * 0.9);
  });

  it("splits output/reasoning tokens proportionally to weight for equal-size comments", () => {
    const result = attributeCommentCost(
      [
        { body: "1234567890", suggestedCode: null },
        { body: "1234567890", suggestedCode: null },
      ],
      turnTokens,
    );

    expect(result[0]?.outputTokens).toBe(250);
    expect(result[1]?.outputTokens).toBe(250);
    expect(result[0]?.reasoningTokens).toBe(100);
    expect(result[1]?.reasoningTokens).toBe(100);
  });

  it("falls back to an even split without dividing by zero when every body is empty", () => {
    // Unreachable via the real parser (it requires a non-empty body) —
    // constructed directly here to exercise the totalWeight === 0 branch.
    const result = attributeCommentCost(
      [
        { body: "", suggestedCode: null },
        { body: "", suggestedCode: null },
      ],
      turnTokens,
    );

    expect(result).toHaveLength(2);
    for (const cost of result) {
      expect(cost.outputTokens).toBe(250);
      expect(cost.reasoningTokens).toBe(100);
      expect(cost.inputTokens).toBe(500);
      expect(Number.isNaN(cost.outputTokens)).toBe(false);
      expect(Number.isNaN(cost.reasoningTokens)).toBe(false);
    }
  });

  it("never throws for an empty comments array even with zero turn tokens", () => {
    expect(() =>
      attributeCommentCost([], { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }),
    ).not.toThrow();
  });
});
