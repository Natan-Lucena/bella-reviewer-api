import { describe, expect, it } from "vitest";

import { CostByModelEntry } from "../repository/review-run.repository";
import { mergeCostByModel } from "./merge-cost-by-model";

function entry(overrides: Partial<CostByModelEntry> = {}): CostByModelEntry {
  return {
    provider: "gemini",
    model: "gemini-2.5-flash",
    totalCost: 10,
    count: 2,
    firstUsedAt: new Date("2026-01-01T00:00:00Z"),
    lastUsedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

describe("mergeCostByModel", () => {
  it("returns [] when both inputs are empty", () => {
    expect(mergeCostByModel([], [])).toEqual([]);
  });

  it("passes through a (provider, model) pair present only in a", () => {
    const onlyInA = entry();

    expect(mergeCostByModel([onlyInA], [])).toEqual([onlyInA]);
  });

  it("passes through a (provider, model) pair present only in b", () => {
    const onlyInB = entry();

    expect(mergeCostByModel([], [onlyInB])).toEqual([onlyInB]);
  });

  it("sums totalCost and count for a pair present in both", () => {
    const fromA = entry({ totalCost: 10, count: 2 });
    const fromB = entry({ totalCost: 5, count: 1 });

    const result = mergeCostByModel([fromA], [fromB]);

    expect(result).toHaveLength(1);
    expect(result[0]?.totalCost).toBe(15);
    expect(result[0]?.count).toBe(3);
  });

  it("combines the date range as min(firstUsedAt)/max(lastUsedAt) when a's window is earlier", () => {
    const fromA = entry({
      firstUsedAt: new Date("2026-01-01T00:00:00Z"),
      lastUsedAt: new Date("2026-01-05T00:00:00Z"),
    });
    const fromB = entry({
      firstUsedAt: new Date("2026-01-10T00:00:00Z"),
      lastUsedAt: new Date("2026-01-15T00:00:00Z"),
    });

    const result = mergeCostByModel([fromA], [fromB]);

    expect(result[0]?.firstUsedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(result[0]?.lastUsedAt).toEqual(new Date("2026-01-15T00:00:00Z"));
  });

  it("combines the date range as min(firstUsedAt)/max(lastUsedAt) when b's window is earlier", () => {
    const fromA = entry({
      firstUsedAt: new Date("2026-01-10T00:00:00Z"),
      lastUsedAt: new Date("2026-01-15T00:00:00Z"),
    });
    const fromB = entry({
      firstUsedAt: new Date("2026-01-01T00:00:00Z"),
      lastUsedAt: new Date("2026-01-05T00:00:00Z"),
    });

    const result = mergeCostByModel([fromA], [fromB]);

    expect(result[0]?.firstUsedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(result[0]?.lastUsedAt).toEqual(new Date("2026-01-15T00:00:00Z"));
  });

  it("keeps distinct providers with the same model name as separate entries", () => {
    const geminiEntry = entry({ provider: "gemini", model: "flash", totalCost: 10 });
    const openaiEntry = entry({ provider: "openai", model: "flash", totalCost: 20 });

    const result = mergeCostByModel([geminiEntry], [openaiEntry]);

    expect(result).toHaveLength(2);
  });

  it("always returns sorted by totalCost descending regardless of input order", () => {
    const low = entry({ provider: "gemini", model: "flash", totalCost: 5 });
    const high = entry({ provider: "gemini", model: "pro", totalCost: 50 });
    const mid = entry({ provider: "openai", model: "gpt", totalCost: 20 });

    const result = mergeCostByModel([low, high], [mid]);

    expect(result.map((r) => r.totalCost)).toEqual([50, 20, 5]);
  });
});
