import { describe, expect, it } from "vitest";

import { parseReviewResponse } from "./review-response-parser";

describe("parseReviewResponse", () => {
  it("parses a well-formed response into ReviewComment[]", () => {
    const content = JSON.stringify({
      comments: [
        {
          file: "src/a.ts",
          line: 10,
          category: "bug",
          severity: "high",
          body: "This looks wrong.",
        },
      ],
    });

    const { comments } = parseReviewResponse(content);

    expect(comments).toEqual([
      { file: "src/a.ts", line: 10, category: "bug", severity: "high", body: "This looks wrong." },
    ]);
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
