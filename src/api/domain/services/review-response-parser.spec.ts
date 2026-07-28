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

    const comments = parseReviewResponse(content);

    expect(comments).toEqual([
      { file: "src/a.ts", line: 10, category: "bug", severity: "high", body: "This looks wrong." },
    ]);
  });

  it("returns an empty array when the model reports no comments", () => {
    expect(parseReviewResponse(JSON.stringify({ comments: [] }))).toEqual([]);
  });

  it("throws when the response isn't valid JSON", () => {
    expect(() => parseReviewResponse("not json")).toThrow(/not valid JSON/);
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
});
