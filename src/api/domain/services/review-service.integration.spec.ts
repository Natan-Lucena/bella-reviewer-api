import { describe, expect, it, vi } from "vitest";

import { GeminiLlmProvider } from "../../integration/gemini/gemini-llm-provider";
import type { Diff } from "../ports/scm-adapter.port";
import { review, ReviewContext } from "./review-service";

// Proves review() is decoupled from transport: it's called here directly,
// with a real GeminiLlmProvider, without any HTTP endpoint, QStash, or
// database involved. Never uses ScmAdapterPort — publishing is out of
// scope for the core.
const apiKey = process.env.GEMINI_API_KEY_TEST;

if (!apiKey) {
  console.warn(
    "GEMINI_API_KEY_TEST is not set — skipping review-service.integration.spec.ts (real Gemini calls need a test API key).",
  );
}

// Real network calls to Gemini take longer than a unit test — give each
// case enough headroom rather than hitting vitest's default 5s timeout.
const REAL_CALL_TIMEOUT_MS = 30000;

const baseContext: Omit<ReviewContext, "tokenLimit"> = {
  temperature: 0.2,
  enabledCategories: [],
  reviewLanguage: "en",
};

function makeLlmProvider(): GeminiLlmProvider {
  return new GeminiLlmProvider(apiKey as string, "gemini-2.5-flash");
}

const trivialDiff: Diff = {
  files: [
    {
      path: "src/greeting.ts",
      hunks: [
        {
          oldStartLine: 1,
          newStartLine: 1,
          lines: [
            { content: 'export const GREETING = "Hello";', status: "removed", lineNumber: 1 },
            {
              content: 'export const GREETING = "Hello, world!";',
              status: "added",
              lineNumber: 1,
            },
          ],
        },
      ],
    },
  ],
};

// The case that matters most for the thesis: add() gains a required third
// parameter in calc.ts, and index.ts's existing call site (shown as
// unchanged context around a trivial added comment, so the file is part of
// the diff at all) is now broken — but only visible by reading both files
// together.
const crossFileDiff: Diff = {
  files: [
    {
      path: "src/utils/calc.ts",
      hunks: [
        {
          oldStartLine: 1,
          newStartLine: 1,
          lines: [
            {
              content: "export function add(a: number, b: number): number {",
              status: "removed",
              lineNumber: 1,
            },
            {
              content: "export function add(a: number, b: number, c: number): number {",
              status: "added",
              lineNumber: 1,
            },
            { content: "  return a + b + c;", status: "added", lineNumber: 2 },
            { content: "}", status: "unchanged", lineNumber: 3 },
          ],
        },
      ],
    },
    {
      path: "src/index.ts",
      hunks: [
        {
          oldStartLine: 1,
          newStartLine: 1,
          lines: [
            {
              content: 'import { add } from "./utils/calc";',
              status: "unchanged",
              lineNumber: 1,
            },
            { content: "// Uses the shared add() helper", status: "added", lineNumber: 2 },
            { content: "const total = add(1, 2);", status: "unchanged", lineNumber: 3 },
          ],
        },
      ],
    },
  ],
};

const securityIssueDiff: Diff = {
  files: [
    {
      path: "src/api/db/query.ts",
      hunks: [
        {
          oldStartLine: 1,
          newStartLine: 1,
          lines: [
            {
              content: "export async function getUserByName(name: string) {",
              status: "added",
              lineNumber: 1,
            },
            {
              content: "  return db.query(`SELECT * FROM users WHERE name = '${name}'`);",
              status: "added",
              lineNumber: 2,
            },
            { content: "}", status: "added", lineNumber: 3 },
          ],
        },
      ],
    },
  ],
};

// Generates a single-file diff of approximately targetChars, so a test can
// size it relative to a given tokenLimit without loading an external fixture.
function makeLargeDiff(targetChars: number): Diff {
  const line = '  console.log("padding line to reach the target diff size for this test");';
  const linesNeeded = Math.max(1, Math.ceil(targetChars / (line.length + 1)));
  const lines = Array.from({ length: linesNeeded }, (_, index) => ({
    content: line,
    status: "added" as const,
    lineNumber: index + 1,
  }));

  return {
    files: [
      {
        path: "src/generated/padding.ts",
        hunks: [{ oldStartLine: 1, newStartLine: 1, lines }],
      },
    ],
  };
}

const describeIfConfigured = apiKey ? describe : describe.skip;

describeIfConfigured("review() — integration (real Gemini)", () => {
  it(
    "handles a trivial single-line diff in exactly one turn",
    async () => {
      const result = await review(
        trivialDiff,
        { ...baseContext, tokenLimit: 100000 },
        { llmProvider: makeLlmProvider() },
      );

      expect(result.totalFailure).toBeUndefined();
      expect(result.turns).toHaveLength(1);
      expect(result.turns[0].inputTokens).toBeGreaterThan(0);
      expect(result.turns[0].outputTokens).toBeGreaterThan(0);
    },
    REAL_CALL_TIMEOUT_MS,
  );

  it(
    "reasons across files: flags the now-broken call site in index.ts after add()'s signature changes in calc.ts",
    async () => {
      const result = await review(
        crossFileDiff,
        {
          ...baseContext,
          tokenLimit: 100000,
          prTitle: "Add a third operand to add()",
          prDescription: "add() now takes three numbers instead of two; callers need updating.",
        },
        { llmProvider: makeLlmProvider() },
      );

      expect(result.totalFailure).toBeUndefined();
      expect(result.turns).toHaveLength(1);
      // Probabilistic (LLM output) — if this starts failing often, the
      // prompt needs work, not this assertion.
      expect(result.comments.some((comment) => comment.file === "src/index.ts")).toBe(true);
    },
    REAL_CALL_TIMEOUT_MS,
  );

  it(
    "flags an obvious SQL injection instead of staying silent",
    async () => {
      const result = await review(
        securityIssueDiff,
        { ...baseContext, tokenLimit: 100000 },
        { llmProvider: makeLlmProvider() },
      );

      expect(result.totalFailure).toBeUndefined();
      // Probabilistic (LLM output) — same caveat as the cross-file case.
      expect(result.comments.length).toBeGreaterThan(0);
    },
    REAL_CALL_TIMEOUT_MS,
  );

  it(
    "still makes exactly one call for a diff sized close to (but under) the token limit",
    async () => {
      const tokenLimit = 3000;
      const diff = makeLargeDiff(tokenLimit * 4 * 0.6);

      const result = await review(
        diff,
        { ...baseContext, tokenLimit },
        { llmProvider: makeLlmProvider() },
      );

      expect(result.totalFailure).toBeUndefined();
      expect(result.turns).toHaveLength(1);
    },
    REAL_CALL_TIMEOUT_MS,
  );

  it("returns totalFailure and makes zero Gemini calls when the diff exceeds the token limit", async () => {
    const tokenLimit = 100;
    const diff = makeLargeDiff(tokenLimit * 4 * 5);
    const llmProvider = makeLlmProvider();
    const generateSpy = vi.spyOn(llmProvider, "generate");

    const result = await review(diff, { ...baseContext, tokenLimit }, { llmProvider });

    expect(result.totalFailure).toBeDefined();
    expect(result.turns).toHaveLength(0);
    expect(generateSpy).not.toHaveBeenCalled();
  });
});
