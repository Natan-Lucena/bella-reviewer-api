// Pure review core — non-negotiable rule: this file MUST NOT import
// anything from @prisma/client, express, or src/api/integration/*. It only
// knows the types below and the LlmProviderPort interface.
//
// v1 sends the whole PR (every file in the diff, plus title/description
// when available) in a single call, instead of reviewing files in
// isolation. Isolated-file review loses exactly what makes a review good:
// cross-file reasoning (a signature change in file A breaking a caller in
// file B) and the PR's intent. A single call is also cheaper in tokens,
// not more expensive — the alternative ("per file, with shared context")
// would repeat the system instruction and PR context on every call. This
// is the v1 baseline the thesis measures cheaper methodologies against, so
// it's deliberately the expensive-but-complete version, not a
// pre-optimized one.
//
// A batching fallback (groups of files sharing PR-level context) is the
// planned answer for PRs that routinely exceed the token budget — not a
// return to per-file isolation. Not implemented here; v1 just fails
// all-or-nothing (see below) when a PR doesn't fit.

import type { LlmProviderPort } from "../ports/llm-provider.port";
import type { Diff } from "../ports/scm-adapter.port";
import { estimateTokenCount } from "./estimate-token-count";
import { buildReviewPrompt, serializeDiffForPrompt } from "./review-prompt";
import { parseReviewResponse } from "./review-response-parser";

export type ReviewContext = {
  tokenLimit: number;
  temperature: number;
  enabledCategories: string[]; // empty = all enabled
  prTitle?: string; // part of the single prompt sent to the model, when available
  prDescription?: string;
};

export type CommentKind = "actionable" | "observation";

export type ReviewComment = {
  file: string;
  line: number;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  body: string;
  kind: CommentKind;
  suggestedCode: string | null;
};

export type TurnResult = {
  index: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  comments: ReviewComment[];
  // Only ever set alongside an empty `comments` — see review-prompt.ts and
  // mindset-and-feedback.ts, "When you find nothing to flag".
  overview: string | null;
  errorReason?: string;
};

export type ReviewResult = {
  comments: ReviewComment[];
  overview: string | null;
  turns: TurnResult[];
  totalFailure?: { reason: string };
};

export async function review(
  diff: Diff,
  context: ReviewContext,
  ports: { llmProvider: LlmProviderPort },
): Promise<ReviewResult> {
  const diffText = serializeDiffForPrompt(diff);
  const estimatedTokens = estimateTokenCount(diffText);

  // All-or-nothing: decided before any LLM call, never a partial review of
  // "the part that fit."
  if (estimatedTokens > context.tokenLimit) {
    return {
      comments: [],
      overview: null,
      turns: [],
      totalFailure: {
        reason: `diff exceeds the configured token limit (estimated: ${estimatedTokens}, limit: ${context.tokenLimit})`,
      },
    };
  }

  const prompt = buildReviewPrompt(diff, context);

  let turn: TurnResult;
  try {
    const result = await ports.llmProvider.generate(prompt);
    const parsed = parseReviewResponse(result.content);
    turn = {
      index: 1,
      inputTokens: result.tokensInput,
      outputTokens: result.tokensOutput,
      reasoningTokens: result.tokensReasoning,
      comments: parsed.comments,
      // Enforced here rather than trusted from the prompt instruction alone
      // — an overview only makes sense as a stand-in for an empty comments
      // list, never alongside real per-line comments.
      overview: parsed.comments.length === 0 ? parsed.overview : null,
    };
  } catch (error) {
    // Covers both the LLM call itself throwing (already retried internally
    // by the provider) and the response failing to parse. Either way, this
    // is the turn's own failure, never propagated out of review().
    turn = {
      index: 1,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      comments: [],
      overview: null,
      errorReason: error instanceof Error ? error.message : String(error),
    };
  }

  // extension point: human-in-the-loop policy. Today: direct-pass-through (no-op)

  return {
    comments: turn.comments,
    overview: turn.overview,
    turns: [turn],
  };
}
