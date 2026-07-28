import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import type { LlmProviderPort } from "../ports/llm-provider.port";
import type { Diff } from "../ports/scm-adapter.port";
import { review, ReviewContext } from "./review-service";

const baseContext: ReviewContext = {
  tokenLimit: 100000,
  temperature: 0.2,
  enabledCategories: [],
};

const multiFileDiff: Diff = {
  files: [
    {
      path: "src/a.ts",
      hunks: [
        {
          oldStartLine: 1,
          newStartLine: 1,
          lines: [{ content: "export function old() {}", status: "removed", lineNumber: 1 }],
        },
      ],
    },
    {
      path: "src/b.ts",
      hunks: [
        {
          oldStartLine: 5,
          newStartLine: 5,
          lines: [{ content: "old();", status: "unchanged", lineNumber: 5 }],
        },
      ],
    },
  ],
};

function validLlmResponse(comments: unknown[] = []): {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
} {
  return {
    content: JSON.stringify({ comments }),
    tokensInput: 120,
    tokensOutput: 30,
    tokensReasoning: 0,
  };
}

describe("review", () => {
  it("returns totalFailure and never calls the LLM when the diff exceeds the token limit", async () => {
    const llmProvider = mock<LlmProviderPort>();
    const hugeDiff: Diff = {
      files: [
        {
          path: "big.ts",
          hunks: [
            {
              oldStartLine: 1,
              newStartLine: 1,
              lines: [{ content: "x".repeat(1000), status: "added", lineNumber: 1 }],
            },
          ],
        },
      ],
    };

    const result = await review(hugeDiff, { ...baseContext, tokenLimit: 10 }, { llmProvider });

    expect(result.totalFailure).toBeDefined();
    expect(result.totalFailure?.reason).toContain("exceeds the configured token limit");
    expect(result.turns).toEqual([]);
    expect(result.comments).toEqual([]);
    expect(llmProvider.generate).not.toHaveBeenCalled();
  });

  it("makes exactly one call for a diff with multiple files (whole-PR, not per-file)", async () => {
    const llmProvider = mock<LlmProviderPort>();
    llmProvider.generate.mockResolvedValue(
      validLlmResponse([
        {
          file: "src/b.ts",
          line: 5,
          category: "bug",
          severity: "high",
          body: "old() no longer exists.",
        },
      ]),
    );

    const result = await review(multiFileDiff, baseContext, { llmProvider });

    expect(llmProvider.generate).toHaveBeenCalledTimes(1);
    const prompt = llmProvider.generate.mock.calls[0][0];
    expect(prompt.userContent).toContain("src/a.ts");
    expect(prompt.userContent).toContain("src/b.ts");

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]).toMatchObject({
      index: 1,
      inputTokens: 120,
      outputTokens: 30,
      reasoningTokens: 0,
    });
    expect(result.comments).toEqual([
      {
        file: "src/b.ts",
        line: 5,
        category: "bug",
        severity: "high",
        body: "old() no longer exists.",
      },
    ]);
  });

  it("includes prTitle/prDescription in the prompt sent to the LLM", async () => {
    const llmProvider = mock<LlmProviderPort>();
    llmProvider.generate.mockResolvedValue(validLlmResponse());

    await review(
      multiFileDiff,
      { ...baseContext, prTitle: "Rename old() to current()", prDescription: "Cleans up naming." },
      { llmProvider },
    );

    const prompt = llmProvider.generate.mock.calls[0][0];
    expect(prompt.userContent).toContain("Rename old() to current()");
    expect(prompt.userContent).toContain("Cleans up naming.");
  });

  it("records a turn-level failure, without throwing, when the LLM call fails", async () => {
    const llmProvider = mock<LlmProviderPort>();
    llmProvider.generate.mockRejectedValue(new Error("permanent provider error"));

    const result = await review(multiFileDiff, baseContext, { llmProvider });

    expect(result.totalFailure).toBeUndefined();
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].errorReason).toBe("permanent provider error");
    expect(result.turns[0].comments).toEqual([]);
    expect(result.comments).toEqual([]);
  });

  it("records a turn-level failure, without throwing, when the LLM response isn't valid JSON", async () => {
    const llmProvider = mock<LlmProviderPort>();
    llmProvider.generate.mockResolvedValue({
      content: "not json",
      tokensInput: 100,
      tokensOutput: 5,
      tokensReasoning: 0,
    });

    const result = await review(multiFileDiff, baseContext, { llmProvider });

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].errorReason).toMatch(/not valid JSON/);
    expect(result.comments).toEqual([]);
  });

  it("never imports Prisma, Express, or a concrete integration adapter", () => {
    const path = fileURLToPath(new URL("./review-service.ts", import.meta.url));
    // Only look at actual import/require lines — the file's own top comment
    // names these same forbidden targets in prose, to explain the rule.
    const importLines = readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));

    for (const line of importLines) {
      expect(line).not.toMatch(/@prisma\/client/);
      expect(line).not.toMatch(/["']express["']/);
      expect(line).not.toMatch(/integration\/(gemini|github)/);
    }
  });
});
