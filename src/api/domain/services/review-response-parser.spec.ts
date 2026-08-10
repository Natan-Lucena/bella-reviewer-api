import { describe, expect, it } from "vitest";

import { parseReviewResponse } from "./review-response-parser";

describe("parseReviewResponse", () => {
  it("parses a well-formed observation comment into ReviewComment[], endLine collapsed to line", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
          endLine: 10,
          category: "bug",
          severity: "high",
          body: "This looks wrong.",
          kind: "observation",
          suggestedCode: null,
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toEqual([
      {
        file: "src/a.ts",
        line: 10,
        endLine: 10,
        category: "bug",
        severity: "high",
        body: "This looks wrong.",
        kind: "observation",
        suggestedCode: null,
      },
    ]);
  });

  it("parses a well-formed single-line actionable comment, keeping its suggestedCode", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
          endLine: 10,
          category: "bug",
          severity: "high",
          body: "Off-by-one.",
          kind: "actionable",
          suggestedCode: "return items[i - 1];",
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments[0]?.kind).toBe("actionable");
    expect(comments[0]?.endLine).toBe(10);
    expect(comments[0]?.suggestedCode).toBe("return items[i - 1];");
  });

  it("keeps a multi-line actionable comment as actionable even when suggestedCode has more lines than the declared range — GitHub replaces the whole range regardless of the replacement's own line count", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
          endLine: 12, // declares a 3-line range (10-12)
          category: "bug",
          severity: "high",
          body: "needs a multi-line fix",
          kind: "actionable",
          suggestedCode: "const seen = new Set();\nfor (const x of items) {\n  seen.add(x);\n}", // 4 lines
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ kind: "actionable", line: 10, endLine: 12 });
  });

  it("keeps a multi-line actionable comment as actionable when suggestedCode collapses the range into fewer lines than it declares", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 2,
          endLine: 8, // declares a 7-line range
          category: "performance",
          severity: "high",
          body: "O(n^2) dedupe — replace the whole loop with a Set-based one-liner.",
          kind: "actionable",
          suggestedCode: "  return Array.from(new Set(items));", // 1 line — collapses the range
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      kind: "actionable",
      line: 2,
      endLine: 8,
      suggestedCode: "  return Array.from(new Set(items));",
    });
  });

  it("keeps a multi-line actionable comment as actionable when the suggestedCode line count exactly matches endLine - line + 1 (still a valid case, just not a requirement)", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
          endLine: 12,
          category: "bug",
          severity: "high",
          body: "needs a multi-line fix",
          kind: "actionable",
          suggestedCode:
            "const seen = new Set();\nfor (const x of items) seen.add(x);\nreturn seen;",
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      kind: "actionable",
      line: 10,
      endLine: 12,
      suggestedCode: "const seen = new Set();\nfor (const x of items) seen.add(x);\nreturn seen;",
    });
  });

  it("drops a comment with an unrecognized kind, without discarding the rest of the response", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
          endLine: 10,
          category: "bug",
          severity: "high",
          body: "kept",
          kind: "observation",
          suggestedCode: null,
        },
        {
          file: "src/b.ts",
          line: 5,
          category: "bug",
          severity: "low",
          body: "dropped",
          kind: "not-a-real-kind",
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe("kept");
  });

  it("degrades an actionable comment with missing/blank suggestedCode to observation, keeping the comment", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
          endLine: 10,
          category: "bug",
          severity: "high",
          body: "missing code",
          kind: "actionable",
        },
        {
          file: "src/b.ts",
          line: 5,
          endLine: 5,
          category: "bug",
          severity: "high",
          body: "blank code",
          kind: "actionable",
          suggestedCode: "   ",
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({
      body: "missing code",
      kind: "observation",
      suggestedCode: null,
      endLine: 10,
    });
    expect(comments[1]).toMatchObject({
      body: "blank code",
      kind: "observation",
      suggestedCode: null,
      endLine: 5,
    });
  });

  it("degrades a SINGLE-LINE declared comment (line === endLine) with multi-line suggestedCode to observation — this exact shape omits start_line, so GitHub would replace only the one anchored line with a multi-line body, the configuration that corrupted a real file once", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
          endLine: 10,
          category: "bug",
          severity: "high",
          body: "needs a multi-line fix but declared a single-line range",
          kind: "actionable",
          suggestedCode: "const seen = new Set();\nreturn seen.has(x);",
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      body: "needs a multi-line fix but declared a single-line range",
      kind: "observation",
      suggestedCode: null,
      endLine: 10,
    });
  });

  it("collapses endLine to line when endLine is missing, non-numeric, or before line — stays actionable here because the (single-line) suggestedCode still matches the collapsed range", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "a.ts",
          line: 10,
          category: "c",
          severity: "high",
          body: "no endLine at all",
          kind: "actionable",
          suggestedCode: "x();",
        },
        {
          file: "b.ts",
          line: 10,
          endLine: "12",
          category: "c",
          severity: "high",
          body: "endLine is a string",
          kind: "actionable",
          suggestedCode: "x();",
        },
        {
          file: "c.ts",
          line: 10,
          endLine: 5,
          category: "c",
          severity: "high",
          body: "endLine before line",
          kind: "actionable",
          suggestedCode: "x();",
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toHaveLength(3);
    for (const comment of comments) {
      expect(comment.endLine).toBe(comment.line);
      expect(comment.kind).toBe("actionable");
    }
  });

  it("collapses endLine to line when malformed, degrading a multi-line suggestedCode to observation (the collapsed range is single-line)", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "a.ts",
          line: 10,
          endLine: 5, // before line — malformed, collapses to 10
          category: "c",
          severity: "high",
          body: "multi-line code with a malformed range",
          kind: "actionable",
          suggestedCode: "a();\nb();",
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ kind: "observation", suggestedCode: null, endLine: 10 });
  });

  it("degrades to observation when the declared range exceeds the 30-line cap", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 1,
          endLine: 40, // 40-line range — over the cap, collapses to line 1
          category: "bug",
          severity: "high",
          body: "way too large a range",
          kind: "actionable",
          suggestedCode: Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n"),
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      kind: "observation",
      suggestedCode: null,
      endLine: 1,
    });
  });

  it("drops a redundant suggestedCode/endLine on an observation comment, keeping kind as observation", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
          endLine: 15,
          category: "bug",
          severity: "high",
          body: "just an observation",
          kind: "observation",
          suggestedCode: "this should be ignored",
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      body: "just an observation",
      kind: "observation",
      suggestedCode: null,
      endLine: 10,
    });
  });

  it("returns an empty array when the model reports no comments", () => {
    expect(parseReviewResponse(JSON.stringify({ comments: [] })).comments).toEqual([]);
  });

  it("throws when the response isn't valid JSON", () => {
    expect(() => parseReviewResponse("not json")).toThrow(/not valid JSON/);
  });

  it("strips a markdown code fence around the JSON before parsing", () => {
    const content = "```json\n" + JSON.stringify({ comments: [] }) + "\n```";

    expect(parseReviewResponse(content).comments).toEqual([]);
  });

  it("strips a code fence without a language tag", () => {
    const content = "```\n" + JSON.stringify({ comments: [] }) + "\n```";

    expect(parseReviewResponse(content).comments).toEqual([]);
  });

  it("throws when the top-level shape doesn't have a comments array", () => {
    expect(() => parseReviewResponse(JSON.stringify({ notComments: [] }))).toThrow(/expected/);
    expect(() => parseReviewResponse(JSON.stringify(["a", "b"]))).toThrow(/expected/);
  });

  it("throws when a comment is missing a required field", () => {
    const content = JSON.stringify({
      comments: [{ file: "src/a.ts", line: 10, category: "bug", body: "missing severity" }],
    });

    expect(() => parseReviewResponse(content)).toThrow(/index 0/);
  });

  it("throws when severity isn't one of the allowed values", () => {
    const content = JSON.stringify({
      comments: [{ file: "src/a.ts", line: 10, category: "bug", severity: "urgent", body: "x" }],
    });

    expect(() => parseReviewResponse(content)).toThrow(/index 0/);
  });

  it("throws for the whole response when one comment among several is malformed — no per-item skipping today", () => {
    const content = JSON.stringify({
      comments: [
        { file: "src/a.ts", line: 10, category: "bug", severity: "high", body: "valid" },
        { file: "src/b.ts", line: 5, category: "bug", body: "missing severity" },
      ],
    });

    expect(() => parseReviewResponse(content)).toThrow(/index 1/);
  });

  it("surfaces a non-blank overview string", () => {
    const content = JSON.stringify({ comments: [], overview: "Clean, well-tested change." });

    expect(parseReviewResponse(content).overview).toBe("Clean, well-tested change.");
  });

  it("treats a missing, blank, or non-string overview as null", () => {
    expect(parseReviewResponse(JSON.stringify({ comments: [] })).overview).toBeNull();
    expect(
      parseReviewResponse(JSON.stringify({ comments: [], overview: null })).overview,
    ).toBeNull();
    expect(
      parseReviewResponse(JSON.stringify({ comments: [], overview: "   " })).overview,
    ).toBeNull();
    expect(parseReviewResponse(JSON.stringify({ comments: [], overview: 42 })).overview).toBeNull();
  });
});
