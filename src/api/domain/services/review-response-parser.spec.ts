import { describe, expect, it } from "vitest";

import { parseReviewResponse } from "./review-response-parser";

describe("parseReviewResponse", () => {
  it("parses a well-formed observation comment into ReviewComment[]", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
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
        category: "bug",
        severity: "high",
        body: "This looks wrong.",
        kind: "observation",
        suggestedCode: null,
      },
    ]);
  });

  it("parses a well-formed actionable comment, keeping its suggestedCode", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
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
    expect(comments[0]?.suggestedCode).toBe("return items[i - 1];");
  });

  it("drops a comment with an unrecognized kind, without discarding the rest of the response", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
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
          category: "bug",
          severity: "high",
          body: "missing code",
          kind: "actionable",
        },
        {
          file: "src/b.ts",
          line: 5,
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
    });
    expect(comments[1]).toMatchObject({
      body: "blank code",
      kind: "observation",
      suggestedCode: null,
    });
  });

  it("drops a redundant suggestedCode on an observation comment, keeping kind as observation", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
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
