import { describe, expect, it } from "vitest";

import { Diff, DiffLine } from "../ports/scm-adapter.port";
import { extractRangeContent } from "./extract-range-content";

function line(content: string, status: DiffLine["status"], lineNumber: number): DiffLine {
  return { content, status, lineNumber };
}

describe("extractRangeContent", () => {
  it("reads the lines within a range, inclusive", () => {
    const diff: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [
            {
              oldStartLine: 1,
              newStartLine: 1,
              lines: [
                line("function f() {", "added", 1),
                line("  return 1;", "added", 2),
                line("}", "added", 3),
              ],
            },
          ],
        },
      ],
    };

    expect(extractRangeContent(diff, "a.ts", 1, 3)).toEqual(["function f() {", "  return 1;", "}"]);
  });

  it("reads a single-line range (line === endLine)", () => {
    const diff: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [{ oldStartLine: 1, newStartLine: 1, lines: [line("return 1;", "added", 5)] }],
        },
      ],
    };

    expect(extractRangeContent(diff, "a.ts", 5, 5)).toEqual(["return 1;"]);
  });

  it("skips removed lines within the range — they're not real content of the new file", () => {
    const diff: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [
            {
              oldStartLine: 1,
              newStartLine: 1,
              lines: [
                line("function f() {", "unchanged", 1),
                line("  const old = 1;", "removed", 2),
                line("  return 2;", "added", 2),
                line("}", "unchanged", 3),
              ],
            },
          ],
        },
      ],
    };

    expect(extractRangeContent(diff, "a.ts", 1, 3)).toEqual(["function f() {", "  return 2;", "}"]);
  });

  it("returns null when the file isn't part of the diff", () => {
    expect(extractRangeContent({ files: [] }, "missing.ts", 1, 3)).toBeNull();
  });

  it("returns null when either endpoint isn't found in the same hunk", () => {
    const diff: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [{ oldStartLine: 1, newStartLine: 1, lines: [line("const x = 1;", "added", 1)] }],
        },
      ],
    };

    expect(extractRangeContent(diff, "a.ts", 1, 999)).toBeNull();
  });
});
