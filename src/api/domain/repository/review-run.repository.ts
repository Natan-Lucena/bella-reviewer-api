import { ReviewRun, ReviewRunStatus } from "../entities/review-run.entity";

export type FindReviewRunsFilter = {
  status?: ReviewRunStatus;
  limit?: number;
  offset?: number;
};

export type UsageSum = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  estimatedCost: number;
};

export type CostByModelEntry = {
  provider: string;
  model: string;
  totalCost: number;
  count: number;
  firstUsedAt: Date;
  lastUsedAt: Date;
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
  // Powers the dashboard's usage summary — an aggregate sum, not a list, so
  // it doesn't load every ReviewRun row into memory just to add them up.
  sumUsageByRepoIdAndDateRange(repoId: string, from: Date, to: Date): Promise<UsageSum>;
  // One batched query for a whole page of comments, instead of one lookup
  // per comment — powers the "prNumber" field on the comment history list.
  findByIds(ids: string[]): Promise<ReviewRun[]>;
  // Groups ReviewRuns by (llmProvider, model), summing estimatedCost (null
  // treated as 0, same convention as sumUsageByRepoIdAndDateRange), counting,
  // and taking MIN/MAX(createdAt) as the usage window within the date range.
  // Excludes rows where llmProvider is null (runs that predate this feature —
  // showing an "unknown model" bucket would just add noise).
  getCostByModelSum(
    repoId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<CostByModelEntry[]>;
}
