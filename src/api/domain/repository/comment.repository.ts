import { Comment, Severity, CommentStatus } from "../entities/comment.entity";

export type FindCommentsFilter = {
  prNumber?: number;
  category?: string;
  severity?: Severity;
  status?: CommentStatus;
  limit?: number;
  offset?: number;
};

export interface CommentRepository {
  save(comment: Comment): Promise<void>;
  findByReviewRunId(reviewRunId: string): Promise<Comment[]>;
  // Scoped by repo (join via ReviewRun).
  findByRepoId(
    repoId: string,
    filter?: FindCommentsFilter,
  ): Promise<{ comments: Comment[]; total: number }>;
  // One batched query for a whole page of runs, instead of one count query
  // per run — powers the "commentCount" field on the review-run list.
  countPublishedByReviewRunIds(reviewRunIds: string[]): Promise<Record<string, number>>;
  // Every actionable comment still awaiting reconciliation for a PR — spans
  // every ReviewRun of that (repoId, prNumber), not just the latest, since a
  // suggestion from an earlier run can be applied by a later push. Filter:
  // kind = "actionable" AND applyStatus = "pending" AND externalId IS NOT
  // NULL (without externalId, publication never succeeded — nothing to
  // reconcile).
  findPendingSuggestionsByRepoIdAndPrNumber(repoId: string, prNumber: number): Promise<Comment[]>;
  // Looks up the comment a GitHub review thread belongs to, by the id
  // publishComment returned when it was posted. Used to reconcile a thread
  // resolution back to the suggestion it was about.
  findByExternalId(externalId: string): Promise<Comment | null>;
}
