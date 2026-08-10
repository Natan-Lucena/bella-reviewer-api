import { Comment } from "../entities/comment.entity";
import { ReviewComment } from "./review-service";

// A push that doesn't fix every previously-flagged issue gets re-reviewed in
// full (review-service.ts always looks at the whole PR, not an increment),
// so the same actionable suggestion can come back verbatim across
// consecutive ReviewRuns for the same PR. Publishing it again would open a
// second "Apply suggestion" button anchored at the same line; applying that
// one after the first (now-outdated) one corrupts the file, since the
// second apply's line anchor no longer matches the file's real content.
// Skipping the republish entirely — the still-pending suggestion from the
// earlier run already has a working button — avoids both the duplicate
// noise and that corruption risk.
export function isDuplicatePendingSuggestion(
  candidate: Pick<ReviewComment, "file" | "line" | "endLine" | "kind" | "suggestedCode">,
  pendingSuggestions: Comment[],
): boolean {
  if (candidate.kind !== "actionable") {
    return false;
  }
  return pendingSuggestions.some(
    (pending) =>
      pending.file === candidate.file &&
      pending.line === candidate.line &&
      pending.endLine === candidate.endLine &&
      pending.suggestedCode === candidate.suggestedCode,
  );
}
