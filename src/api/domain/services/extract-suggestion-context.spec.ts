import { describe, expect, it } from "vitest";

import { Diff, DiffLine } from "../ports/scm-adapter.port";
import { extractSuggestionContext } from "./extract-suggestion-context";

function line(content: string, status: DiffLine["status"], lineNumber: number): DiffLine {
  return { content, status, lineNumber };
}

describe("extractSuggestionContext", () => {
  it("captures the unchanged lines immediately before/after the target line", () => {
    const diff: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [
            {
              oldStartLine: 39,
              newStartLine: 39,
              lines: [
                line("function calculateTotal(items) {", "unchanged", 39),
                line("  return items.reduce((sum, i) => sum + i.price);", "added", 40),
                line("}", "unchanged", 41),
              ],
            },
          ],
        },
      ],
    };

    const context = extractSuggestionContext(diff, "a.ts", 40);

    expect(context).toEqual({
      contextBefore: "function calculateTotal(items) {",
      contextAfter: "}",
    });
  });

  it("returns null contextBefore when the target line opens its hunk", () => {
    const diff: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [
            {
              oldStartLine: 1,
              newStartLine: 1,
              lines: [line("const x = 1;", "added", 1), line("const y = 2;", "unchanged", 2)],
            },
          ],
        },
      ],
    };

    expect(extractSuggestionContext(diff, "a.ts", 1)).toEqual({
      contextBefore: null,
      contextAfter: "const y = 2;",
    });
  });

  it("returns null contextAfter when the target line closes its hunk", () => {
    const diff: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [
            {
              oldStartLine: 1,
              newStartLine: 1,
              lines: [line("const y = 2;", "unchanged", 1), line("const x = 1;", "added", 2)],
            },
          ],
        },
      ],
    };

    expect(extractSuggestionContext(diff, "a.ts", 2)).toEqual({
      contextBefore: "const y = 2;",
      contextAfter: null,
    });
  });

  it("skips over a removed neighbor to find the nearest line that really exists in the new file", () => {
    // A removed line's lineNumber is an insertion-point placeholder shared
    // with the line after it — not a real position of its own.
    const diff: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [
            {
              oldStartLine: 1,
              newStartLine: 1,
              lines: [
                line("function calculateTotal(items) {", "unchanged", 1),
                line("  const old = 0;", "removed", 2),
                line("  return items.reduce((sum, i) => sum + i.price);", "added", 2),
                line("}", "unchanged", 3),
              ],
            },
          ],
        },
      ],
    };

    expect(extractSuggestionContext(diff, "a.ts", 2)).toEqual({
      contextBefore: "function calculateTotal(items) {",
      contextAfter: "}",
    });
  });

  it("returns both null when the file isn't part of the diff", () => {
    const diff: Diff = { files: [] };

    expect(extractSuggestionContext(diff, "missing.ts", 1)).toEqual({
      contextBefore: null,
      contextAfter: null,
    });
  });

  it("returns both null when the line isn't found in any hunk of that file", () => {
    const diff: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [{ oldStartLine: 1, newStartLine: 1, lines: [line("const x = 1;", "added", 1)] }],
        },
      ],
    };

    expect(extractSuggestionContext(diff, "a.ts", 999)).toEqual({
      contextBefore: null,
      contextAfter: null,
    });
  });
});
