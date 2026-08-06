import { failure, Result, success } from "../../../../shared/core/result";
import { ApplyStatus, Severity } from "../../../domain/entities/comment.entity";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";
import { DashboardPeriod, getPeriodRange } from "../../../domain/services/dashboard-period";

export type GetAcceptanceMetricsParams = {
  userId: string;
  repoId: string;
  period: DashboardPeriod;
};

export type GetAcceptanceMetricsError = "repo_not_found";

export type GetAcceptanceMetricsResult = {
  applyRate: { value: number | null; decidedCount: number; appliedCount: number };
  applyRateByCategory: Array<{ category: string; value: number | null; decidedCount: number }>;
  applyRateBySeverity: Array<{ severity: Severity; value: number | null; decidedCount: number }>;
  coverage: {
    actionableCount: number;
    observationCount: number;
    actionableShare: number | null;
  };
  costPerAppliedSuggestion: number | null;
  previousPeriod: {
    applyRate: { value: number | null };
    costPerAppliedSuggestion: number | null;
  };
};

type StatusCount = { applyStatus: ApplyStatus; count: number };

// A suggestion still "pending" hasn't had a chance to be decided yet (its PR
// may still be open), and "superseded" is neutral by definition — counting
// either as decided would dilute the rate with cases that represent neither
// acceptance nor rejection.
const DECIDED_STATUSES: ApplyStatus[] = [
  "applied_button",
  "applied_manual",
  "not_applied",
  "dismissed",
];
const APPLIED_STATUSES: ApplyStatus[] = ["applied_button", "applied_manual"];

function computeRate(groups: StatusCount[]): {
  value: number | null;
  decidedCount: number;
  appliedCount: number;
} {
  let decidedCount = 0;
  let appliedCount = 0;
  for (const group of groups) {
    if (DECIDED_STATUSES.includes(group.applyStatus)) {
      decidedCount += group.count;
    }
    if (APPLIED_STATUSES.includes(group.applyStatus)) {
      appliedCount += group.count;
    }
  }
  return {
    value: decidedCount === 0 ? null : (appliedCount / decidedCount) * 100,
    decidedCount,
    appliedCount,
  };
}

function applyRateByCategory(
  groups: Array<{ category: string; applyStatus: ApplyStatus; count: number }>,
): Array<{ category: string; value: number | null; decidedCount: number }> {
  const byCategory = new Map<string, StatusCount[]>();
  for (const group of groups) {
    const bucket = byCategory.get(group.category) ?? [];
    bucket.push({ applyStatus: group.applyStatus, count: group.count });
    byCategory.set(group.category, bucket);
  }
  return Array.from(byCategory.entries()).map(([category, statusCounts]) => {
    const { value, decidedCount } = computeRate(statusCounts);
    return { category, value, decidedCount };
  });
}

function applyRateBySeverity(
  groups: Array<{ severity: Severity; applyStatus: ApplyStatus; count: number }>,
): Array<{ severity: Severity; value: number | null; decidedCount: number }> {
  const bySeverity = new Map<Severity, StatusCount[]>();
  for (const group of groups) {
    const bucket = bySeverity.get(group.severity) ?? [];
    bucket.push({ applyStatus: group.applyStatus, count: group.count });
    bySeverity.set(group.severity, bucket);
  }
  return Array.from(bySeverity.entries()).map(([severity, statusCounts]) => {
    const { value, decidedCount } = computeRate(statusCounts);
    return { severity, value, decidedCount };
  });
}

export class GetAcceptanceMetricsUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly commentRepository: CommentRepository,
    private readonly reviewRunRepository: ReviewRunRepository,
  ) {}

  async execute(
    params: GetAcceptanceMetricsParams,
  ): Promise<Result<GetAcceptanceMetricsResult, GetAcceptanceMetricsError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    const range = getPeriodRange(params.period, new Date());

    const [currentStats, previousStats, currentUsage, previousUsage] = await Promise.all([
      this.commentRepository.getAcceptanceStats(params.repoId, {
        from: range.currentFrom,
        to: range.currentTo,
      }),
      this.commentRepository.getAcceptanceStats(params.repoId, {
        from: range.previousFrom,
        to: range.previousTo,
      }),
      this.reviewRunRepository.sumUsageByRepoIdAndDateRange(
        params.repoId,
        range.currentFrom,
        range.currentTo,
      ),
      this.reviewRunRepository.sumUsageByRepoIdAndDateRange(
        params.repoId,
        range.previousFrom,
        range.previousTo,
      ),
    ]);

    const currentOverall = computeRate(currentStats.byCategory);
    const previousOverall = computeRate(previousStats.byCategory);

    const totalCurrent = currentStats.actionableCount + currentStats.observationCount;

    return success({
      applyRate: currentOverall,
      applyRateByCategory: applyRateByCategory(currentStats.byCategory),
      applyRateBySeverity: applyRateBySeverity(currentStats.bySeverity),
      coverage: {
        actionableCount: currentStats.actionableCount,
        observationCount: currentStats.observationCount,
        actionableShare:
          totalCurrent === 0 ? null : (currentStats.actionableCount / totalCurrent) * 100,
      },
      costPerAppliedSuggestion:
        currentOverall.appliedCount === 0
          ? null
          : currentUsage.estimatedCost / currentOverall.appliedCount,
      previousPeriod: {
        applyRate: { value: previousOverall.value },
        costPerAppliedSuggestion:
          previousOverall.appliedCount === 0
            ? null
            : previousUsage.estimatedCost / previousOverall.appliedCount,
      },
    });
  }
}
