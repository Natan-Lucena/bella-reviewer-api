// Pure review core — non-negotiable rule: this file MUST NOT import
// anything from @prisma/client, express, or src/api/integration/*. It only
// knows the types below and the LlmProviderPort interface. The real
// implementation is left for later — this file is just the
// contract/signature.

import type { LlmProviderPort } from "../ports/llm-provider.port";
import type { Diff } from "../ports/scm-adapter.port";

export type ReviewContext = {
  tokenLimit: number;
  temperature: number;
  enabledCategories: string[]; // empty = all enabled
  prTitle?: string; // part of the single prompt sent to the model, when available
  prDescription?: string;
};

export type ReviewComment = {
  file: string;
  line: number;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  body: string;
};

export type TurnResult = {
  index: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  comments: ReviewComment[];
  errorReason?: string;
};

export type ReviewResult = {
  comments: ReviewComment[];
  turns: TurnResult[];
  totalFailure?: { reason: string };
};

export async function review(
  _diff: Diff,
  _context: ReviewContext,
  _ports: { llmProvider: LlmProviderPort },
): Promise<ReviewResult> {
  throw new Error("not implemented");
}
