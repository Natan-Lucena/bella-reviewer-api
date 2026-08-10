import { describe, expect, it } from "vitest";

import { relocateSuggestionLine } from "./relocate-suggestion-line";

describe("relocateSuggestionLine", () => {
  it("falls back to the original line when no context was captured (comment predates this field)", () => {
    const lines = ["a", "b", "c"];

    const index = relocateSuggestionLine(lines, {
      line: 2,
      contextBefore: null,
      contextAfter: null,
    });

    expect(index).toBe(1);
  });

  it("returns the original line when its neighbors still match — no drift happened", () => {
    const lines = ["function calculateTotal(items) {", "  return items.reduce(...)", "}"];

    const index = relocateSuggestionLine(lines, {
      line: 2,
      contextBefore: "function calculateTotal(items) {",
      contextAfter: "}",
    });

    expect(index).toBe(1);
  });

  it("relocates to the unique position elsewhere whose neighbors match, when the original position drifted", () => {
    // 5 unrelated lines were inserted above — the target line moved from
    // index 1 to index 6, but is still sandwiched by the same neighbors.
    const lines = [
      "import a from 'a';",
      "import b from 'b';",
      "import c from 'c';",
      "import d from 'd';",
      "import e from 'e';",
      "function calculateTotal(items) {",
      "  return items.reduce((sum, i) => sum + i.price, 0);",
      "}",
    ];

    const index = relocateSuggestionLine(lines, {
      line: 2, // stale — the suggestion was published against the pre-insertion file
      contextBefore: "function calculateTotal(items) {",
      contextAfter: "}",
    });

    expect(index).toBe(6);
  });

  it("returns null when neither the original position nor any unique position matches — can't relocate confidently", () => {
    const lines = ["totally", "different", "file"];

    const index = relocateSuggestionLine(lines, {
      line: 2,
      contextBefore: "function calculateTotal(items) {",
      contextAfter: "}",
    });

    expect(index).toBeNull();
  });

  it("returns null when the context matches more than one position — ambiguous, not guessed", () => {
    const lines = ["}", "x", "}", "y", "}"];

    const index = relocateSuggestionLine(lines, {
      line: 10,
      contextBefore: null,
      contextAfter: "}",
    });

    expect(index).toBeNull();
  });

  it("trims whitespace when comparing context, same normalization as the suggestedCode comparison", () => {
    const lines = ["  function calculateTotal(items) {  ", "  return x;", "  }  "];

    const index = relocateSuggestionLine(lines, {
      line: 2,
      contextBefore: "function calculateTotal(items) {",
      contextAfter: "}",
    });

    expect(index).toBe(1);
  });

  it("works with only contextBefore available (edge of hunk) when the original position still matches", () => {
    const lines = ["function calculateTotal(items) {", "  return x;"];

    const index = relocateSuggestionLine(lines, {
      line: 2,
      contextBefore: "function calculateTotal(items) {",
      contextAfter: null,
    });

    expect(index).toBe(1);
  });

  describe("multi-line ranges (rangeLength)", () => {
    it("checks contextAfter rangeLength lines past the start, not just 1 — a multi-line range still matches at its original position", () => {
      const lines = [
        "function dedupe(items) {",
        "  const seen = new Set();",
        "  for (const x of items) seen.add(x);",
        "  return seen;",
        "}",
      ];

      // Range is lines 2-4 (0-indexed 1-3), 3 lines long. contextAfter ("}")
      // is the line after index 3, i.e. index 4 — rangeLength=3 away from
      // the start index (1), not 1 away.
      const index = relocateSuggestionLine(lines, {
        line: 2,
        contextBefore: "function dedupe(items) {",
        contextAfter: "}",
        rangeLength: 3,
      });

      expect(index).toBe(1);
    });

    it("relocates a multi-line range when unrelated lines were inserted above it", () => {
      const lines = [
        "import a from 'a';",
        "import b from 'b';",
        "function dedupe(items) {",
        "  const seen = new Set();",
        "  for (const x of items) seen.add(x);",
        "  return seen;",
        "}",
      ];

      const index = relocateSuggestionLine(lines, {
        line: 2, // stale — published before the two imports were inserted
        contextBefore: "function dedupe(items) {",
        contextAfter: "}",
        rangeLength: 3,
      });

      expect(index).toBe(3);
    });

    it("fails to relocate a multi-line range when rangeLength is omitted (defaults to 1) even though the range itself is longer — demonstrates why callers must always pass it", () => {
      const lines = [
        "function dedupe(items) {",
        "  const seen = new Set();",
        "  for (const x of items) seen.add(x);",
        "  return seen;",
        "}",
      ];

      // Same as the first test above, but without rangeLength: contextAfter
      // is checked 1 line past the start (index 2, "for (const x..."), not
      // 3 lines past (index 4, "}") — so nothing matches at the true start
      // position, and the search elsewhere in the file finds no candidate
      // either.
      const index = relocateSuggestionLine(lines, {
        line: 2,
        contextBefore: "function dedupe(items) {",
        contextAfter: "}",
      });

      expect(index).toBeNull();
    });
  });
});
