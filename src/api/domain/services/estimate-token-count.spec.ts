import { describe, expect, it } from "vitest";

import { estimateTokenCount } from "./estimate-token-count";

describe("estimateTokenCount", () => {
  it("estimates roughly one token per 4 characters, rounded up", () => {
    expect(estimateTokenCount("abcd")).toBe(1);
    expect(estimateTokenCount("abcde")).toBe(2);
    expect(estimateTokenCount("a".repeat(400))).toBe(100);
  });

  it("returns 0 for an empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });
});
