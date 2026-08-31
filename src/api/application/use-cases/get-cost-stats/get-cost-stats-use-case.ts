import { failure, Result, success } from "../../../../shared/core/result";
import { CommentReplyRepository } from "../../../domain/repository/comment-reply.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CostByModelEntry, ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";
import { DashboardPeriod, getPeriodRange } from "../../../domain/services/dashboard-period";
import { mergeCostByModel } from "../../../domain/services/merge-cost-by-model";

export type GetCostStatsParams = {
  userId: string;
  repoId: string;
  period: DashboardPeriod;
};

export type GetCostStatsError = "repo_not_found";

export type CostRunType = "review" | "comment_reply";

export type CostBreakdownEntry = {
  category: string;
  runType: CostRunType;
  totalCost: number;
  count: number;
};

export type CostStats = {
  totalCost: number;
  totalCostByRunType: Array<{ runType: CostRunType; totalCost: number; count: number }>;
  // Sorted by totalCost descending — the chart consuming this wants
  // "biggest spend first" already sorted.
  breakdown: CostBreakdownEntry[];
  // Sorted by totalCost descending, same convention as breakdown.
  byModel: CostByModelEntry[];
  previousPeriod: { totalCost: number };
};

function sumCost(rows: Array<{ totalCost: number }>): number {
  return rows.reduce((sum, row) => sum + row.totalCost, 0);
}

function sumCount(rows: Array<{ count: number }>): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

export class GetCostStatsUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly commentRepository: CommentRepository,
    private readonly commentReplyRepository: CommentReplyRepository,
    private readonly reviewRunRepository: ReviewRunRepository,
  ) {}

  async execute(params: GetCostStatsParams): Promise<Result<CostStats, GetCostStatsError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    const range = getPeriodRange(params.period, new Date());

    const [
      reviewCosts,
      replyCosts,
      previousReviewCosts,
      previousReplyCosts,
      reviewCostsByModel,
      replyCostsByModel,
    ] = await Promise.all([
      this.commentRepository.getCostByCategorySum(params.repoId, {
        from: range.currentFrom,
        to: range.currentTo,
      }),
      this.commentReplyRepository.getCostByCategorySum(params.repoId, {
        from: range.currentFrom,
        to: range.currentTo,
      }),
      this.commentRepository.getCostByCategorySum(params.repoId, {
        from: range.previousFrom,
        to: range.previousTo,
      }),
      this.commentReplyRepository.getCostByCategorySum(params.repoId, {
        from: range.previousFrom,
        to: range.previousTo,
      }),
      this.reviewRunRepository.getCostByModelSum(params.repoId, {
        from: range.currentFrom,
        to: range.currentTo,
      }),
      this.commentReplyRepository.getCostByModelSum(params.repoId, {
        from: range.currentFrom,
        to: range.currentTo,
      }),
    ]);

    const breakdown: CostBreakdownEntry[] = [
      ...reviewCosts.map((c) => ({ ...c, runType: "review" as const })),
      ...replyCosts.map((c) => ({ ...c, runType: "comment_reply" as const })),
    ].sort((a, b) => b.totalCost - a.totalCost);

    return success({
      totalCost: sumCost(reviewCosts) + sumCost(replyCosts),
      totalCostByRunType: [
        { runType: "review", totalCost: sumCost(reviewCosts), count: sumCount(reviewCosts) },
        {
          runType: "comment_reply",
          totalCost: sumCost(replyCosts),
          count: sumCount(replyCosts),
        },
      ],
      breakdown,
      byModel: mergeCostByModel(reviewCostsByModel, replyCostsByModel),
      previousPeriod: {
        totalCost: sumCost(previousReviewCosts) + sumCost(previousReplyCosts),
      },
    });
  }
}
