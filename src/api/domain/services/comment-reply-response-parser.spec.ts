import { describe, expect, it } from "vitest";

import { parseCommentReplyResponse } from "./comment-reply-response-parser";

describe("parseCommentReplyResponse", () => {
  it("parses a valid full response", () => {
    const content = JSON.stringify({
      body: "Here's a for-loop version.",
      suggestedCode: "for (let i = 0; i < items.length; i++) {}",
      category: "fix",
    });

    expect(parseCommentReplyResponse(content)).toEqual({
      body: "Here's a for-loop version.",
      suggestedCode: "for (let i = 0; i < items.length; i++) {}",
      category: "fix",
    });
  });

  it("parses a response wrapped in a markdown code fence", () => {
    const content = [
      "```json",
      JSON.stringify({ body: "It's a real bug.", suggestedCode: null, category: "clarification" }),
      "```",
    ].join("\n");

    expect(parseCommentReplyResponse(content)).toEqual({
      body: "It's a real bug.",
      suggestedCode: null,
      category: "clarification",
    });
  });

  it("throws when body is missing", () => {
    const content = JSON.stringify({ suggestedCode: null, category: "fix" });

    expect(() => parseCommentReplyResponse(content)).toThrow(
      'LLM response does not match the expected { "body": string, "suggestedCode": string | null, "category": string } shape',
    );
  });

  it("throws when body has the wrong type", () => {
    const content = JSON.stringify({ body: 42, suggestedCode: null, category: "fix" });

    expect(() => parseCommentReplyResponse(content)).toThrow();
  });

  it("falls back to 'other' when category is missing, without throwing", () => {
    const content = JSON.stringify({ body: "Thanks!", suggestedCode: null });

    expect(parseCommentReplyResponse(content)).toEqual({
      body: "Thanks!",
      suggestedCode: null,
      category: "other",
    });
  });

  it("falls back to 'other' when category is not a recognized value, without throwing", () => {
    const content = JSON.stringify({ body: "Thanks!", suggestedCode: null, category: "praise" });

    expect(parseCommentReplyResponse(content)).toEqual({
      body: "Thanks!",
      suggestedCode: null,
      category: "other",
    });
  });

  it("resolves suggestedCode to null when absent", () => {
    const content = JSON.stringify({ body: "No fix needed.", category: "acknowledgment" });

    expect(parseCommentReplyResponse(content).suggestedCode).toBeNull();
  });

  it("resolves suggestedCode to null when it has a non-string type", () => {
    const content = JSON.stringify({ body: "No fix needed.", suggestedCode: 123, category: "other" });

    expect(parseCommentReplyResponse(content).suggestedCode).toBeNull();
  });
});
