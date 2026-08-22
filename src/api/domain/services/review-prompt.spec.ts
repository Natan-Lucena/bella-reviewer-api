import { describe, expect, it } from "vitest";

import type { Diff } from "../ports/scm-adapter.port";
import { buildReviewPrompt, serializeDiffForPrompt } from "./review-prompt";
import type { ReviewContext } from "./review-service";

const baseContext: ReviewContext = {
  tokenLimit: 100000,
  temperature: 0.2,
  enabledCategories: [],
  reviewLanguage: "en",
};

const sampleDiff: Diff = {
  files: [
    {
      path: "src/a.ts",
      hunks: [
        {
          oldStartLine: 1,
          newStartLine: 1,
          lines: [
            { content: "const x = 1;", status: "unchanged", lineNumber: 1 },
            { content: "const y = 2;", status: "removed", lineNumber: 2 },
            { content: "const y = 3;", status: "added", lineNumber: 2 },
          ],
        },
      ],
    },
  ],
};

describe("serializeDiffForPrompt", () => {
  it("renders each file's path and hunk markers", () => {
    const text = serializeDiffForPrompt(sampleDiff);

    expect(text).toContain("--- src/a.ts");
    expect(text).toContain("@@ -1 +1 @@");
    expect(text).toContain(" const x = 1;");
    expect(text).toContain("-const y = 2;");
    expect(text).toContain("+const y = 3;");
  });

  it("joins multiple files with a blank line between them", () => {
    const twoFileDiff: Diff = {
      files: [
        { path: "a.ts", hunks: [] },
        { path: "b.ts", hunks: [] },
      ],
    };

    const text = serializeDiffForPrompt(twoFileDiff);

    expect(text).toBe("--- a.ts\n\n\n--- b.ts\n");
  });
});

describe("buildReviewPrompt", () => {
  it("lists enabled categories when provided", () => {
    const prompt = buildReviewPrompt(sampleDiff, {
      ...baseContext,
      enabledCategories: ["security", "bug"],
    });

    expect(prompt.systemInstruction).toContain("Focus only on these categories: security, bug.");
  });

  it("falls back to 'all relevant categories' when none are configured", () => {
    const prompt = buildReviewPrompt(sampleDiff, baseContext);

    expect(prompt.systemInstruction).toContain("Consider all relevant categories");
  });

  it("includes PR title and description in userContent when present", () => {
    const prompt = buildReviewPrompt(sampleDiff, {
      ...baseContext,
      prTitle: "Fix pagination bug",
      prDescription: "Callers assumed the old offset.",
    });

    expect(prompt.userContent).toContain("PR title: Fix pagination bug");
    expect(prompt.userContent).toContain("PR description:\nCallers assumed the old offset.");
  });

  it("omits PR title/description sections when absent", () => {
    const prompt = buildReviewPrompt(sampleDiff, baseContext);

    expect(prompt.userContent).not.toContain("PR title:");
    expect(prompt.userContent).not.toContain("PR description:");
  });

  it("includes the serialized diff in userContent", () => {
    const prompt = buildReviewPrompt(sampleDiff, baseContext);

    expect(prompt.userContent).toContain("--- src/a.ts");
  });

  it("passes the context's temperature through unchanged", () => {
    const prompt = buildReviewPrompt(sampleDiff, { ...baseContext, temperature: 0.7 });

    expect(prompt.temperature).toBe(0.7);
  });

  it("instructs the model to reason across files and to respond in strict JSON", () => {
    const prompt = buildReviewPrompt(sampleDiff, baseContext);

    expect(prompt.systemInstruction).toMatch(/cross-file|across files/i);
    expect(prompt.systemInstruction).toContain('"comments"');
  });

  it("describes the optional overview field and when it may/may not be used", () => {
    const prompt = buildReviewPrompt(sampleDiff, baseContext);

    expect(prompt.systemInstruction).toContain('"overview"');
    expect(prompt.systemInstruction).toMatch(/only praises the code/i);
    expect(prompt.systemInstruction).toMatch(/never set "overview" when comments is non-empty/i);
  });

  it("asks for the comment shape including line/endLine/kind/suggestedCode", () => {
    const prompt = buildReviewPrompt(sampleDiff, baseContext);

    expect(prompt.systemInstruction).toContain(
      'Respond with ONLY a JSON object matching this exact shape, no markdown code fences, no text before or after it: {"comments": [{"file": string, "line": number, "endLine": number, "category": string, "severity": "low" | "medium" | "high" | "critical", "body": string, "kind": "actionable" | "observation", "suggestedCode": string | null}], "overview": string | null}',
    );
  });

  it("explains the line/endLine range convention", () => {
    const prompt = buildReviewPrompt(sampleDiff, baseContext);

    expect(prompt.systemInstruction).toMatch(
      /"line" is the first line your comment targets and "endLine" is the last/i,
    );
  });

  it("explains the actionable-vs-observation classification criterion and the suggestedCode contract", () => {
    const prompt = buildReviewPrompt(sampleDiff, baseContext);

    expect(prompt.systemInstruction).toMatch(
      /"actionable" only when the fix is a clean, mechanical replacement of lines "line" through "endLine"/i,
    );
    expect(prompt.systemInstruction).toMatch(/never span more than 30 lines/i);
    expect(prompt.systemInstruction).toMatch(/classify it as "observation" instead/i);
    expect(prompt.systemInstruction).toMatch(
      /"suggestedCode" must be a non-blank string when kind is "actionable", and must be null when kind is "observation"/i,
    );
  });

  it("embeds the language-agnostic review guidance in the system instruction", () => {
    const prompt = buildReviewPrompt(sampleDiff, baseContext);

    expect(prompt.systemInstruction).toContain("## Review mindset");
    expect(prompt.systemInstruction).toContain("## Architecture review");
    expect(prompt.systemInstruction).toContain("## Security review");
    expect(prompt.systemInstruction).toContain("## Performance review");
    expect(prompt.systemInstruction).toContain("## Async and concurrency review");
    expect(prompt.systemInstruction).toContain("## Error handling review");
    expect(prompt.systemInstruction).toContain("## Code quality review");
    expect(prompt.systemInstruction).toContain("## Common bugs checklist");
  });

  describe("customInstructions", () => {
    it("embeds the built-in guidance library, unchanged, when customInstructions is not set", () => {
      const prompt = buildReviewPrompt(sampleDiff, baseContext);

      expect(prompt.systemInstruction).toContain(
        "The following is your detailed reviewing guidance. It applies across programming languages — use whichever sections are relevant to the diff you are given, and ignore any that don't apply.",
      );
      expect(prompt.systemInstruction).toContain("## Review mindset");
      expect(prompt.systemInstruction).toContain("## Architecture review");
      expect(prompt.systemInstruction).not.toContain("written by this repository's maintainer");
    });

    it("replaces the guidance section with the maintainer's custom prompt when customInstructions is set", () => {
      const customInstructions = "Focus only on null-safety issues in TypeScript.";
      const prompt = buildReviewPrompt(sampleDiff, { ...baseContext, customInstructions });

      expect(prompt.systemInstruction).toContain(
        "The following is your reviewing guidance, written by this repository's maintainer — follow it as the primary basis for what to focus on and how to write your comments:",
      );
      expect(prompt.systemInstruction).toContain(customInstructions);

      // The built-in guidance library must not leak in alongside the custom prompt.
      expect(prompt.systemInstruction).not.toContain(
        "The following is your detailed reviewing guidance. It applies across programming languages",
      );
      expect(prompt.systemInstruction).not.toContain("## Review mindset");
      expect(prompt.systemInstruction).not.toContain("## Architecture review");
      expect(prompt.systemInstruction).not.toContain("## Security review");
      expect(prompt.systemInstruction).not.toContain("## Performance review");
      expect(prompt.systemInstruction).not.toContain("## Async and concurrency review");
      expect(prompt.systemInstruction).not.toContain("## Error handling review");
      expect(prompt.systemInstruction).not.toContain("## Code quality review");
      expect(prompt.systemInstruction).not.toContain("## Common bugs checklist");
    });

    it("keeps the response-format contract byte-for-byte identical with and without customInstructions", () => {
      // The contract lines that must never change, custom prompt or not —
      // see review-service.ts's ReviewContext comment for why.
      const contractLines = [
        'Respond with ONLY a JSON object matching this exact shape, no markdown code fences, no text before or after it: {"comments": [{"file": string, "line": number, "endLine": number, "category": string, "severity": "low" | "medium" | "high" | "critical", "body": string, "kind": "actionable" | "observation", "suggestedCode": string | null}], "overview": string | null}',
        "If there is nothing worth commenting on, respond with an empty comments array — do not invent issues to have something to say, and do not add a comment that only praises the code instead of flagging a real problem.",
        '"line" is the first line your comment targets and "endLine" is the last — set "endLine" equal to "line" for a single-line comment.',
        'Classify every comment\'s "kind" as "actionable" only when the fix is a clean, mechanical replacement of lines "line" through "endLine" (inclusive) — set "suggestedCode" to the complete replacement text for that whole range, with no line numbers and no markdown fences. "suggestedCode" does NOT need the same number of lines as the range: collapsing a multi-line block into a shorter (even one-line) replacement is normal and expected, as is expanding a single line into several — GitHub replaces the entire declared range with whatever "suggestedCode" contains, regardless of line count on either side. Keep the range itself as small as possible — include only the lines that actually need to change, never pad it with unchanged context, and never span more than 30 lines. If the fix cannot be expressed as a clean replacement of one contiguous line range (it requires edits in multiple, non-adjacent places, spans more than 30 lines, or touches a different file), classify it as "observation" instead. Also classify as "observation" anything that isn\'t a mechanical code fix at all (a design decision, an architectural tradeoff, a pattern spread across multiple files, a question with no single "answer" in code) — for "observation", set "suggestedCode" to null and "endLine" equal to "line". "suggestedCode" must be a non-blank string when kind is "actionable", and must be null when kind is "observation" — never mix the two.',
        'When comments is empty, you may optionally set "overview" to a short paragraph (2-4 sentences) on real, specific points of attention for the change as a whole — positive or negative, e.g. a notable design decision, a coverage gap, a tradeoff worth flagging. Never use it for generic praise like "looks good" with nothing behind it — if you have nothing specific to say even at that level, leave it null. Never set "overview" when comments is non-empty; leave it null in that case.',
      ];

      const defaultPrompt = buildReviewPrompt(sampleDiff, baseContext);
      const customPrompt = buildReviewPrompt(sampleDiff, {
        ...baseContext,
        customInstructions: "Focus only on null-safety issues in TypeScript.",
      });

      for (const line of contractLines) {
        expect(defaultPrompt.systemInstruction).toContain(line);
        expect(customPrompt.systemInstruction).toContain(line);
      }

      // Both prompts must end with the exact same contract tail, regardless
      // of what precedes it (built-in guidance vs. custom instructions).
      const defaultTail = defaultPrompt.systemInstruction.slice(
        defaultPrompt.systemInstruction.indexOf(contractLines[0]),
      );
      const customTail = customPrompt.systemInstruction.slice(
        customPrompt.systemInstruction.indexOf(contractLines[0]),
      );
      expect(customTail).toBe(defaultTail);

      // And the framing before the skill section is also untouched.
      const defaultHead = defaultPrompt.systemInstruction.slice(
        0,
        defaultPrompt.systemInstruction.indexOf("Only comment on lines that are part of the diff"),
      );
      const customHead = customPrompt.systemInstruction.slice(
        0,
        customPrompt.systemInstruction.indexOf("Only comment on lines that are part of the diff"),
      );
      expect(customHead).toBe(defaultHead);
    });
  });

  describe("reviewLanguage", () => {
    it("instructs the model to write body/category/overview in the configured language", () => {
      const prompt = buildReviewPrompt(sampleDiff, { ...baseContext, reviewLanguage: "pt" });

      expect(prompt.systemInstruction).toContain(
        'Write every piece of natural-language text you produce — each comment\'s "body", the free-text "category" label, and "overview" if you set it — in Portuguese.',
      );
    });

    it('explicitly tells the model not to translate "severity"/"kind"', () => {
      const prompt = buildReviewPrompt(sampleDiff, { ...baseContext, reviewLanguage: "es" });

      expect(prompt.systemInstruction).toContain(
        'Keep "severity" and "kind" exactly as the English literal values specified below (low/medium/high/critical, actionable/observation) — those are parsed as exact strings by the platform, never translate them.',
      );
    });

    it("keeps every other line byte-for-byte identical across different reviewLanguage values, only languageLine changes", () => {
      const ptPrompt = buildReviewPrompt(sampleDiff, { ...baseContext, reviewLanguage: "pt" });
      const esPrompt = buildReviewPrompt(sampleDiff, { ...baseContext, reviewLanguage: "es" });

      const ptLines = ptPrompt.systemInstruction.split("\n\n");
      const esLines = esPrompt.systemInstruction.split("\n\n");

      expect(ptLines).toHaveLength(esLines.length);

      const languageLineIndex = ptLines.findIndex((line) =>
        line.startsWith("Write every piece of natural-language text you produce"),
      );
      expect(languageLineIndex).toBeGreaterThanOrEqual(0);

      ptLines.forEach((line, index) => {
        if (index === languageLineIndex) {
          expect(line).not.toBe(esLines[index]);
          expect(line).toContain("Portuguese");
          expect(esLines[index]).toContain("Spanish");
        } else {
          expect(line).toBe(esLines[index]);
        }
      });
    });

    it("is always included, even when reviewLanguage is 'en' (no conditional omission)", () => {
      const prompt = buildReviewPrompt(sampleDiff, { ...baseContext, reviewLanguage: "en" });

      expect(prompt.systemInstruction).toContain(
        'Write every piece of natural-language text you produce — each comment\'s "body", the free-text "category" label, and "overview" if you set it — in English.',
      );
    });
  });
});
