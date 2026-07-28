import { describe, expect, it } from "vitest";

import { getPeriodRange, percentageChange } from "./dashboard-period";

describe("getPeriodRange", () => {
  it("computes a 30d window ending now, and an equal-size window right before it", () => {
    const now = new Date("2026-03-01T00:00:00Z");

    const range = getPeriodRange("30d", now);

    expect(range.currentTo).toEqual(now);
    expect(range.currentFrom).toEqual(new Date("2026-01-30T00:00:00Z"));
    expect(range.previousTo).toEqual(range.currentFrom);
    expect(range.previousFrom).toEqual(new Date("2025-12-31T00:00:00Z"));
  });

  it("scales the window size to the requested period", () => {
    const now = new Date("2026-03-01T00:00:00Z");

    const range7d = getPeriodRange("7d", now);
    const range90d = getPeriodRange("90d", now);

    expect(range7d.currentFrom).toEqual(new Date("2026-02-22T00:00:00Z"));
    expect(range90d.currentFrom).toEqual(new Date("2025-12-01T00:00:00Z"));
  });
});

describe("percentageChange", () => {
  it("computes the percentage increase from previous to current", () => {
    expect(percentageChange(150, 100)).toBe(50);
  });

  it("computes a negative percentage for a decrease", () => {
    expect(percentageChange(50, 100)).toBe(-50);
  });

  it("returns null when there's no previous-period baseline to compare against", () => {
    expect(percentageChange(100, 0)).toBeNull();
  });
});
