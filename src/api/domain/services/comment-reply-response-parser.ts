import { CommentReplyCategory } from "../entities/comment-reply.entity";
import { stripMarkdownCodeFence } from "./review-response-parser";

const VALID_CATEGORIES = new Set<CommentReplyCategory>([
  "fix",
  "clarification",
  "disagreement",
  "acknowledgment",
  "other",
]);

// Parses the model's raw text response for a comment-thread reply. Unlike
// parseReviewResponse, there is no array of independently-degradable items
// here — only "category" is metadata rather than the main content, so only
// it degrades (to "other") instead of failing the whole response.
export function parseCommentReplyResponse(content: string): {
  body: string;
  suggestedCode: string | null;
  category: CommentReplyCategory;
} {
  const parsed: unknown = JSON.parse(stripMarkdownCodeFence(content));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).body !== "string"
  ) {
    throw new Error(
      'LLM response does not match the expected { "body": string, "suggestedCode": string | null, "category": string } shape',
    );
  }

  const candidate = parsed as Record<string, unknown>;
  const suggestedCode = typeof candidate.suggestedCode === "string" ? candidate.suggestedCode : null;
  const category = VALID_CATEGORIES.has(candidate.category as CommentReplyCategory)
    ? (candidate.category as CommentReplyCategory)
    : "other";

  return { body: candidate.body as string, suggestedCode, category };
}
