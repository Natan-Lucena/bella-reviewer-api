import { ReviewRun, ReviewRunStatus } from "../entities/review-run.entity";

export type FindReviewRunsFilter = {
  status?: ReviewRunStatus;
  limit?: number;
  offset?: number;
};

export interface ReviewRunRepository {
  save(reviewRun: ReviewRun): Promise<void>;
  findById(id: string): Promise<ReviewRun | null>;
  // Backbone of ingestion idempotency.
  findByRepoIdAndCommitSha(repoId: string, commitSha: string): Promise<ReviewRun | null>;
  findByRepoId(
    repoId: string,
    filter?: FindReviewRunsFilter,
  ): Promise<{ reviewRuns: ReviewRun[]; total: number }>;
}
