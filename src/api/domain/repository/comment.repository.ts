import { ApplyStatus, Comment, Severity, CommentStatus } from "../entities/comment.entity";

export type FindCommentsFilter = {
  prNumber?: number;
  category?: string;
  severity?: Severity;
  status?: CommentStatus;
  limit?: number;
  offset?: number;
};

export type AcceptanceStats = {
  byCategory: Array<{ category: string; applyStatus: ApplyStatus; count: number }>;
  bySeverity: Array<{ severity: Severity; applyStatus: ApplyStatus; count: number }>;
  actionableCount: number;
  observationCount: number;
};

export interface CommentRepository {
  save(comment: Comment): Promise<void>;
  findById(id: string): Promise<Comment | null>;
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
  // Raw grouped counts behind the acceptance-metrics endpoint. Scoped to
  // kind = "actionable" (only actionable comments have an applyStatus) and
  // createdAt within the range (cohort by generation date, not decision
  // date — see 21-endpoints-leitura-aceitacao.md). Returns every applyStatus
  // as-is, including pending/superseded — excluding those from the
  // "decided" denominator is the use case's job, not this query's.
  getAcceptanceStats(repoId: string, dateRange: { from: Date; to: Date }): Promise<AcceptanceStats>;
  // Sums estimatedCost (treating null as 0, same convention as
  // ReviewRunRepository.sumUsageByRepoIdAndDateRange) grouped by category,
  // filtered by createdAt within the date range and repoId via the ReviewRun
  // join. No status/kind filter — every generated comment had a generation
  // cost, published or not.
  getCostByCategorySum(
    repoId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<Array<{ category: string; totalCost: number; count: number }>>;
}
