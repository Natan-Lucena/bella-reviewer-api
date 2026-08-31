import { CommentReply } from "../entities/comment-reply.entity";

export interface CommentReplyRepository {
  save(reply: CommentReply): Promise<void>;
  findById(id: string): Promise<CommentReply | null>;
  // Idempotency guard against webhook redelivery — see the schema comment on
  // CommentReply.humanExternalId.
  findByHumanExternalId(humanExternalId: string): Promise<CommentReply | null>;
  // Loop-prevention guard: is this incoming comment id something Bella
  // herself already published as a reply? Deliberately a SEPARATE check
  // from findByHumanExternalId — that one only proves "have I already
  // processed this exact comment as a trigger", which says nothing about
  // whether the comment IS one of Bella's own outputs. Bella publishes with
  // the same GitHub identity as the SCM credential owner (see PRD 29's
  // Motivação), so this is the only reliable way to stop her from replying
  // to her own replies.
  findByBellaExternalId(bellaExternalId: string): Promise<CommentReply | null>;
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
}
