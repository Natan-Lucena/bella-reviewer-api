import { describe, expect, it } from "vitest";

import type { Diff } from "../ports/scm-adapter.port";
import { buildReviewPrompt, serializeDiffForPrompt } from "./review-prompt";
import type { ReviewContext } from "./review-service";

const baseContext: ReviewContext = {
  tokenLimit: 100000,
  temperature: 0.2,
  enabledCategories: [],
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
});
