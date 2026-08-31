import { describe, expect, it } from "vitest";

import { buildCommentReplyPrompt, type CommentReplyContext } from "./comment-reply-prompt";

const baseContext: CommentReplyContext = {
  prTitle: "Fix pagination bug",
  prDescription: null,
  customInstructions: undefined,
  otherComments: [],
  file: "src/a.ts",
  originalCategory: "bug",
  originalSeverity: "high",
  originalBody: "This offset is off by one.",
  originalSuggestedCode: null,
  contextBefore: null,
  contextAfter: null,
  priorExchanges: [],
  humanBody: "Can you turn this into a for loop?",
  reviewLanguage: "en",
  temperature: 0.2,
};

describe("buildCommentReplyPrompt", () => {
  describe("systemInstruction", () => {
    it("includes the custom-instructions block when customInstructions is set", () => {
      const prompt = buildCommentReplyPrompt({
        ...baseContext,
        customInstructions: "Focus only on null-safety issues in TypeScript.",
      });

      expect(prompt.systemInstruction).toContain(
        "Repo-specific review guidance to follow:\nFocus only on null-safety issues in TypeScript.",
      );
    });

    it("omits the custom-instructions block when customInstructions is undefined", () => {
      const prompt = buildCommentReplyPrompt(baseContext);

      expect(prompt.systemInstruction).not.toContain("Repo-specific review guidance to follow:");
    });

    it("writes the language instruction using the configured reviewLanguage", () => {
      const prompt = buildCommentReplyPrompt({ ...baseContext, reviewLanguage: "pt" });

      expect(prompt.systemInstruction).toContain('Write "body" in Portuguese.');
    });

    it("describes the category classification and the JSON-only response contract", () => {
      const prompt = buildCommentReplyPrompt(baseContext);

      expect(prompt.systemInstruction).toContain('"fix" when they are explicitly asking you to correct');
      expect(prompt.systemInstruction).toContain(
        'Respond with ONLY a JSON object matching this exact shape, no markdown code fences, no text before or after it: {"body": string, "suggestedCode": string | null, "category": "fix" | "clarification" | "disagreement" | "acknowledgment" | "other"}',
      );
    });
  });

  describe("userContent", () => {
    it("always includes the PR title", () => {
      const prompt = buildCommentReplyPrompt(baseContext);

      expect(prompt.userContent).toContain("PR title: Fix pagination bug");
    });

    it("includes the PR description only when present", () => {
      const withDescription = buildCommentReplyPrompt({
        ...baseContext,
        prDescription: "Callers assumed the old offset.",
      });
      const withoutDescription = buildCommentReplyPrompt(baseContext);

      expect(withDescription.userContent).toContain(
        "PR description:\nCallers assumed the old offset.",
      );
      expect(withoutDescription.userContent).not.toContain("PR description:");
    });

    it("includes the original comment's file, category, severity and body", () => {
      const prompt = buildCommentReplyPrompt(baseContext);

      expect(prompt.userContent).toContain("File: src/a.ts");
      expect(prompt.userContent).toContain(
        "Your original comment (bug, high):\nThis offset is off by one.",
      );
    });

    it("includes the original suggestedCode only when present", () => {
      const withCode = buildCommentReplyPrompt({
        ...baseContext,
        originalSuggestedCode: "return items[i - 1];",
      });
      const withoutCode = buildCommentReplyPrompt(baseContext);

      expect(withCode.userContent).toContain(
        "Your original suggested code:\nreturn items[i - 1];",
      );
      expect(withoutCode.userContent).not.toContain("Your original suggested code:");
    });

    it("includes surrounding code when either contextBefore or contextAfter is present", () => {
      const prompt = buildCommentReplyPrompt({
        ...baseContext,
        contextBefore: "const items = [];",
        contextAfter: "return items;",
      });

      expect(prompt.userContent).toContain(
        "Surrounding code:\nconst items = [];\n[the commented line(s)]\nreturn items;",
      );
    });

    it("omits the surrounding-code section when both contextBefore and contextAfter are null", () => {
      const prompt = buildCommentReplyPrompt(baseContext);

      expect(prompt.userContent).not.toContain("Surrounding code:");
    });

    it("includes the otherComments summary only when non-empty", () => {
      const withOthers = buildCommentReplyPrompt({
        ...baseContext,
        otherComments: [
          { file: "src/b.ts", line: 42, category: "security", severity: "critical", body: "SQL injection risk." },
        ],
      });
      const withoutOthers = buildCommentReplyPrompt(baseContext);

      expect(withOthers.userContent).toContain(
        "Other comments you left elsewhere in this same review, for context only:\n- src/b.ts:42 (security, critical): SQL injection risk.",
      );
      expect(withoutOthers.userContent).not.toContain("Other comments you left elsewhere");
    });

    it("includes prior exchanges in chronological order followed by the new human message last", () => {
      const prompt = buildCommentReplyPrompt({
        ...baseContext,
        priorExchanges: [
          { humanBody: "Why is this a problem?", bellaBody: "Because it reads past the array bounds." },
          { humanBody: "Got it, can you fix it?", bellaBody: "Sure, see the suggestion below." },
        ],
        humanBody: "Can you turn this into a for loop instead?",
      });

      const humanFirst = prompt.userContent.indexOf("Human: Why is this a problem?");
      const bellaFirst = prompt.userContent.indexOf(
        "You: Because it reads past the array bounds.",
      );
      const humanSecond = prompt.userContent.indexOf("Human: Got it, can you fix it?");
      const bellaSecond = prompt.userContent.indexOf("You: Sure, see the suggestion below.");
      const newHumanMessage = prompt.userContent.indexOf(
        "Human: Can you turn this into a for loop instead?",
      );

      expect(humanFirst).toBeGreaterThanOrEqual(0);
      expect(bellaFirst).toBeGreaterThan(humanFirst);
      expect(humanSecond).toBeGreaterThan(bellaFirst);
      expect(bellaSecond).toBeGreaterThan(humanSecond);
      expect(newHumanMessage).toBeGreaterThan(bellaSecond);
      // The new human message must be the last thing in userContent.
      expect(prompt.userContent.trim().endsWith("Human: Can you turn this into a for loop instead?")).toBe(
        true,
      );
    });

    it("includes the new human message even with no prior exchanges", () => {
      const prompt = buildCommentReplyPrompt(baseContext);

      expect(prompt.userContent).toContain("Human: Can you turn this into a for loop?");
    });
  });

  it("passes the context's temperature through unchanged", () => {
    const prompt = buildCommentReplyPrompt({ ...baseContext, temperature: 0.7 });

    expect(prompt.temperature).toBe(0.7);
  });
});
