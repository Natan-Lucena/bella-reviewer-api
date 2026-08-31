import { CommentReply } from "../entities/comment-reply.entity";
import { CostByModelEntry } from "./review-run.repository";

export interface CommentReplyRepository {
  save(reply: CommentReply): Promise<void>;
  findById(id: string): Promise<CommentReply | null>;
  // Idempotency guard against webhook redelivery — see the schema comment on
  // CommentReply.humanExternalId.
  findByHumanExternalId(humanExternalId: string): Promise<CommentReply | null>;
  findByCommentId(commentId: string): Promise<CommentReply[]>;
  countByCommentId(commentId: string): Promise<number>;
  // Sums estimatedCost (treating null as 0, same convention as
  // ReviewRunRepository.sumUsageByRepoIdAndDateRange) grouped by category,
  // filtered by createdAt within the date range and repoId via
  // Comment -> ReviewRun. Excludes rows where category IS NULL — a
  // CommentReply still queued/processing, or failed before generation
  // completed, was never classified and never had a real cost either.
  getCostByCategorySum(
    repoId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<Array<{ category: string; totalCost: number; count: number }>>;
  // Same aggregation as ReviewRunRepository.getCostByModelSum, but scoped to
  // CommentReply and filtered by repoId via the same Comment -> ReviewRun
  // two-hop relation used by getCostByCategorySum.
  getCostByModelSum(
    repoId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<CostByModelEntry[]>;
}
