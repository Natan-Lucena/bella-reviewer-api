import { describe, expect, it } from "vitest";

import { suggestedCodeOverlapsBoundary } from "./suggested-code-overlaps-boundary";

describe("suggestedCodeOverlapsBoundary", () => {
  it("returns false when suggestedCode stays entirely within the declared range", () => {
    const overlaps = suggestedCodeOverlapsBoundary(
      "const seen = new Set();\nfor (const x of items) seen.add(x);\nreturn seen;",
      "function dedupe(items) {",
      "}",
    );

    expect(overlaps).toBe(false);
  });

  it("returns true when suggestedCode's first line duplicates the line right before the range (real case: a re-included function signature)", () => {
    const overlaps = suggestedCodeOverlapsBoundary(
      [
        "export function findMax(items: number[]): number {",
        "  if (items.length === 0) {",
        "    throw new Error();",
        "  }",
        "  let max = items[0];",
        "  return max;",
      ].join("\n"),
      "export function findMax(items: number[]): number {",
      null,
    );

    expect(overlaps).toBe(true);
  });

  it("returns true when a duplicated boundary line appears anywhere in suggestedCode, not just as the first/last line", () => {
    const overlaps = suggestedCodeOverlapsBoundary(
      [
        "export function averageValue(items: number[]): number {",
        "  if (items.length === 0) {",
        "    return 0;",
        "  }",
        "  let total = 0;", // this line is contextBefore, but it's buried mid-suggestion
        "  for (let i = 0; i < items.length; i++) {",
        "    total = total + items[i];",
        "  }",
        "  return total / items.length;",
        "}",
      ].join("\n"),
      "let total = 0;",
      null,
    );

    expect(overlaps).toBe(true);
  });

  it("returns true when suggestedCode's last line duplicates the line right after the range", () => {
    const overlaps = suggestedCodeOverlapsBoundary(
      [
        "export function findMin(items: number[]): number {",
        "  let min = items[0];",
        "  for (let i = 1; i < items.length; i++) {",
        "    if (items[i] < min) min = items[i];",
        "  }",
        "  return min;", // this duplicates contextAfter below
      ].join("\n"),
      null,
      "return min;",
    );

    expect(overlaps).toBe(true);
  });

  it("returns false when both contextBefore and contextAfter are null (no neighbors captured)", () => {
    const overlaps = suggestedCodeOverlapsBoundary("return x;", null, null);

    expect(overlaps).toBe(false);
  });

  it("trims whitespace before comparing, same normalization as the rest of the reconciliation logic", () => {
    const overlaps = suggestedCodeOverlapsBoundary(
      "  return total / items.length;  ",
      null,
      "return total / items.length;",
    );

    expect(overlaps).toBe(true);
  });

  it("returns false for a single-line suggestion whose one line legitimately differs from both neighbors", () => {
    const overlaps = suggestedCodeOverlapsBoundary(
      "return items[i - 1];",
      "function calculateTotal(items) {",
      "}",
    );

    expect(overlaps).toBe(false);
  });
});
