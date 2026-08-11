import { describe, expect, it } from "vitest";

import { suggestedCodeMismatchesActualRange } from "./suggested-code-mismatches-actual-range";

describe("suggestedCodeMismatchesActualRange", () => {
  it("returns false when the suggestion is a straightforward edit of the actual range", () => {
    const mismatches = suggestedCodeMismatchesActualRange(
      [
        "  let total = 0;",
        "  for (let i = 0; i < items.length; i++) {",
        "    total = total + items[i];",
        "  }",
        "  return total / items.length;",
      ],
      "  if (items.length === 0) {\n    return 0;\n  }\n  let total = 0;\n  for (let i = 0; i < items.length; i++) {\n    total = total + items[i];\n  }\n  return total / items.length;",
    );

    expect(mismatches).toBe(false);
  });

  it("returns false when only one meaningful line still matches (a near-total rewrite, but genuinely of the same block)", () => {
    const mismatches = suggestedCodeMismatchesActualRange(
      [
        "  for (let i = items.length; i >= 0; i--) {",
        "    if (predicate(items[i])) {",
        "      return i;",
        "    }",
        "  }",
        "  return -1;",
      ],
      "  for (let i = items.length - 1; i >= 0; i--) {\n    if (predicate(items[i])) {\n      return i;\n    }\n  }\n  return -1;",
    );

    expect(mismatches).toBe(false);
  });

  // Reproduces a real case found live: a suggestion for `binarySearch`
  // (a different function) declared over a range that's actually part of
  // `clampToRange`'s body — zero meaningful content in common.
  it("returns true when suggestedCode shares zero meaningful content with the actual range — reproduces a real wrong-location case", () => {
    const mismatches = suggestedCodeMismatchesActualRange(
      ["  let low = 0;", "  let high = sorted.length;", "  while (low < high) {"],
      "    } else if (sorted[mid] < target) {\n      low = mid + 1;\n    } else {\n      high = mid;\n    }",
    );

    expect(mismatches).toBe(true);
  });

  // Reproduces another real case: a full-function suggestion for
  // `countInRange` declared over a range that's actually the tail of
  // `everyNth` and the start of `fillRange`.
  it("returns true for a full-function suggestion declared over an unrelated block", () => {
    const mismatches = suggestedCodeMismatchesActualRange(
      [
        "    result.push(items[i]);",
        "  }",
        "  if (n === 0) {",
        "    return items;",
        "  }",
        "  return result;",
        "}",
      ],
      "export function countInRange(items: number[], min: number, max: number): number {\n  let count = 0;\n  for (let i = 0; i < items.length; i++) {\n    if (items[i] >= min && items[i] <= max) {\n      count++;\n    }\n  }\n  return count;\n}",
    );

    expect(mismatches).toBe(true);
  });

  it("returns false when the actual range has no meaningful lines to compare (e.g. only braces) — not enough signal to block", () => {
    const mismatches = suggestedCodeMismatchesActualRange(
      ["{", "}"],
      "export function f() {\n  return 1;\n}",
    );

    expect(mismatches).toBe(false);
  });

  // Reproduces a real false positive caught before merge: a small range
  // (below the meaningful-line threshold) that's totally and legitimately
  // rewritten shares zero exact lines with the original, but that's normal
  // for a short block — not enough signal to call it the wrong location.
  it("returns false for a small range (below the threshold) that's totally rewritten, even with zero line overlap", () => {
    const mismatches = suggestedCodeMismatchesActualRange(
      ["  let max = items[0];", "  return max;"],
      "  if (items.length === 0) throw new Error();\n  return items[0];",
    );

    expect(mismatches).toBe(false);
  });

  it("ignores trivial punctuation-only lines on both sides when comparing", () => {
    const mismatches = suggestedCodeMismatchesActualRange(
      ["  return result;", "}"],
      "  return result;\n}",
    );

    expect(mismatches).toBe(false);
  });

  it("trims whitespace before comparing", () => {
    const mismatches = suggestedCodeMismatchesActualRange(["  return total;  "], "return total;");

    expect(mismatches).toBe(false);
  });
});
