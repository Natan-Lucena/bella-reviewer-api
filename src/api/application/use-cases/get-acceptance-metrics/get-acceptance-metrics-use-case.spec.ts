import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Repo } from "../../../domain/entities/repo.entity";
import { AcceptanceStats, CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository, UsageSum } from "../../../domain/repository/review-run.repository";
import { GetAcceptanceMetricsUseCase } from "./get-acceptance-metrics-use-case";

function stats(overrides: Partial<AcceptanceStats> = {}): AcceptanceStats {
  return {
    byCategory: [],
    bySeverity: [],
    actionableCount: 0,
    observationCount: 0,
    ...overrides,
  };
}

function usage(overrides: Partial<UsageSum> = {}): UsageSum {
  return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, estimatedCost: 0, ...overrides };
}

describe("GetAcceptanceMetricsUseCase", () => {
  it("returns repo_not_found when the repo doesn't belong to the user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new GetAcceptanceMetricsUseCase(
      repoRepository,
      mock<CommentRepository>(),
      mock<ReviewRunRepository>(),
    );

    const result = await useCase.execute({ userId: "user-1", repoId: "repo-1", period: "30d" });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
  });

  it("returns applyRate.value === null and costPerAppliedSuggestion === null when nothing was decided", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);

    const commentRepository = mock<CommentRepository>();
    commentRepository.getAcceptanceStats.mockResolvedValue(
      stats({
        byCategory: [{ category: "bug", applyStatus: "pending", count: 3 }],
        actionableCount: 3,
      }),
    );

    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.sumUsageByRepoIdAndDateRange.mockResolvedValue(usage());

    const useCase = new GetAcceptanceMetricsUseCase(
      repoRepository,
      commentRepository,
      reviewRunRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      period: "30d",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.applyRate).toEqual({ value: null, decidedCount: 0, appliedCount: 0 });
    expect(result.value.costPerAppliedSuggestion).toBeNull();
  });

  it("excludes pending and superseded from decidedCount, and computes applyRate/cost correctly", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);

    const commentRepository = mock<CommentRepository>();
    commentRepository.getAcceptanceStats
      .mockResolvedValueOnce(
        stats({
          byCategory: [
            { category: "bug", applyStatus: "applied_manual", count: 2 },
            { category: "bug", applyStatus: "not_applied", count: 1 },
            { category: "style", applyStatus: "applied_button", count: 1 },
            { category: "style", applyStatus: "pending", count: 5 },
            { category: "style", applyStatus: "superseded", count: 2 },
          ],
          bySeverity: [
            { severity: "high", applyStatus: "applied_manual", count: 2 },
            { severity: "high", applyStatus: "not_applied", count: 1 },
            { severity: "low", applyStatus: "applied_button", count: 1 },
            { severity: "low", applyStatus: "pending", count: 5 },
            { severity: "low", applyStatus: "superseded", count: 2 },
          ],
          actionableCount: 15,
          observationCount: 5,
        }),
      )
      .mockResolvedValueOnce(stats());

    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.sumUsageByRepoIdAndDateRange
      .mockResolvedValueOnce(usage({ estimatedCost: 12 }))
      .mockResolvedValueOnce(usage({ estimatedCost: 0 }));

    const useCase = new GetAcceptanceMetricsUseCase(
      repoRepository,
      commentRepository,
      reviewRunRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      period: "30d",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // decided = 2 + 1 + 1 = 4 (pending and superseded excluded); applied = 2 + 1 = 3
    expect(result.value.applyRate).toEqual({ value: 75, decidedCount: 4, appliedCount: 3 });
    expect(result.value.applyRateByCategory).toEqual(
      expect.arrayContaining([
        { category: "bug", value: (2 / 3) * 100, decidedCount: 3 },
        { category: "style", value: 100, decidedCount: 1 },
      ]),
    );
    expect(result.value.applyRateBySeverity).toEqual(
      expect.arrayContaining([
        { severity: "high", value: (2 / 3) * 100, decidedCount: 3 },
        { severity: "low", value: 100, decidedCount: 1 },
      ]),
    );
    expect(result.value.coverage).toEqual({
      actionableCount: 15,
      observationCount: 5,
      actionableShare: 75,
    });
    // 12 / 3 applied
    expect(result.value.costPerAppliedSuggestion).toBe(4);
    expect(result.value.previousPeriod).toEqual({
      applyRate: { value: null },
      costPerAppliedSuggestion: null,
    });
  });

  it("queries the current and previous windows from getPeriodRange", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const commentRepository = mock<CommentRepository>();
    commentRepository.getAcceptanceStats.mockResolvedValue(stats());
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.sumUsageByRepoIdAndDateRange.mockResolvedValue(usage());

    const useCase = new GetAcceptanceMetricsUseCase(
      repoRepository,
      commentRepository,
      reviewRunRepository,
    );

    await useCase.execute({ userId: "user-1", repoId: repo.id.value, period: "7d" });

    expect(commentRepository.getAcceptanceStats).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = commentRepository.getAcceptanceStats.mock.calls;
    expect(firstCall?.[0]).toBe(repo.id.value);
    expect(secondCall?.[0]).toBe(repo.id.value);
    // The previous window ends exactly where the current window starts.
    expect(secondCall?.[1].to).toEqual(firstCall?.[1].from);
  });

  it("returns null coverage.actionableShare when there are no comments of either kind", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const commentRepository = mock<CommentRepository>();
    commentRepository.getAcceptanceStats.mockResolvedValue(stats());
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.sumUsageByRepoIdAndDateRange.mockResolvedValue(usage());

    const useCase = new GetAcceptanceMetricsUseCase(
      repoRepository,
      commentRepository,
      reviewRunRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      period: "30d",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.coverage.actionableShare).toBeNull();
  });
});
