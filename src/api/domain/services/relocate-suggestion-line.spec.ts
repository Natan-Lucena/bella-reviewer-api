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
});
