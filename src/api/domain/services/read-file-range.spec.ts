import { describe, expect, it } from "vitest";

import { normalizeMultilineCode, readFileRange } from "./read-file-range";

describe("readFileRange", () => {
  it("reads a single-line range, matching the pre-DT-02 single-line behavior", () => {
    const lines = ["a", "b", "c"];

    expect(readFileRange(lines, 1, 1)).toBe("b");
  });

  it("reads and joins a multi-line range with newlines, trimming each line", () => {
    const lines = ["function f() {", "  return 1;", "}"];

    expect(readFileRange(lines, 0, 3)).toBe("function f() {\nreturn 1;\n}");
  });

  it("trims each line individually rather than the block as a whole", () => {
    const lines = ["  const a = 1;  ", "  const b = 2;  "];

    expect(readFileRange(lines, 0, 2)).toBe("const a = 1;\nconst b = 2;");
  });

  it("returns null when the range runs past the end of the file", () => {
    const lines = ["a", "b", "c"];

    expect(readFileRange(lines, 1, 5)).toBeNull();
  });

  it("returns null for a negative startIndex", () => {
    const lines = ["a", "b", "c"];

    expect(readFileRange(lines, -1, 1)).toBeNull();
  });

  it("reads a range that exactly reaches the last line", () => {
    const lines = ["a", "b", "c"];

    expect(readFileRange(lines, 1, 2)).toBe("b\nc");
  });
});

describe("normalizeMultilineCode", () => {
  it("trims each line independently", () => {
    expect(normalizeMultilineCode("  a  \n  b  ")).toBe("a\nb");
  });

  it("leaves a single-line string's surrounding whitespace trimmed", () => {
    expect(normalizeMultilineCode("  return x;  ")).toBe("return x;");
  });

  it("handles an empty string", () => {
    expect(normalizeMultilineCode("")).toBe("");
  });
});
