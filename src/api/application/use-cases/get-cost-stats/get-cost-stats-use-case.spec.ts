import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Repo } from "../../../domain/entities/repo.entity";
import { CommentReplyRepository } from "../../../domain/repository/comment-reply.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { GetCostStatsUseCase } from "./get-cost-stats-use-case";

describe("GetCostStatsUseCase", () => {
  it("returns repo_not_found when the repo doesn't belong to the user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new GetCostStatsUseCase(
      repoRepository,
      mock<CommentRepository>(),
      mock<CommentReplyRepository>(),
    );

    const result = await useCase.execute({ userId: "user-1", repoId: "repo-1", period: "30d" });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
  });

  it("returns totalCost 0 and an empty breakdown when there's no data", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const commentRepository = mock<CommentRepository>();
    commentRepository.getCostByCategorySum.mockResolvedValue([]);
    const commentReplyRepository = mock<CommentReplyRepository>();
    commentReplyRepository.getCostByCategorySum.mockResolvedValue([]);

    const useCase = new GetCostStatsUseCase(
      repoRepository,
      commentRepository,
      commentReplyRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      period: "30d",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalCost).toBe(0);
    expect(result.value.breakdown).toEqual([]);
    expect(result.value.totalCostByRunType).toEqual([
      { runType: "review", totalCost: 0, count: 0 },
      { runType: "comment_reply", totalCost: 0, count: 0 },
    ]);
    expect(result.value.previousPeriod).toEqual({ totalCost: 0 });
  });

  it("combines both sources into breakdown with the right runType, sorted by totalCost descending", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);

    const commentRepository = mock<CommentRepository>();
    commentRepository.getCostByCategorySum
      .mockResolvedValueOnce([
        { category: "bug", totalCost: 5, count: 2 },
        { category: "style", totalCost: 20, count: 4 },
      ])
      .mockResolvedValueOnce([]);

    const commentReplyRepository = mock<CommentReplyRepository>();
    commentReplyRepository.getCostByCategorySum
      .mockResolvedValueOnce([{ category: "bug", totalCost: 15, count: 3 }])
      .mockResolvedValueOnce([]);

    const useCase = new GetCostStatsUseCase(
      repoRepository,
      commentRepository,
      commentReplyRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      period: "30d",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.breakdown).toEqual([
      { category: "style", runType: "review", totalCost: 20, count: 4 },
      { category: "bug", runType: "comment_reply", totalCost: 15, count: 3 },
      { category: "bug", runType: "review", totalCost: 5, count: 2 },
    ]);
  });

  it("keeps totalCost and totalCostByRunType internally consistent with breakdown's sum", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);

    const commentRepository = mock<CommentRepository>();
    commentRepository.getCostByCategorySum
      .mockResolvedValueOnce([
        { category: "bug", totalCost: 5, count: 2 },
        { category: "style", totalCost: 20, count: 4 },
      ])
      .mockResolvedValueOnce([{ category: "bug", totalCost: 3, count: 1 }]);

    const commentReplyRepository = mock<CommentReplyRepository>();
    commentReplyRepository.getCostByCategorySum
      .mockResolvedValueOnce([{ category: "bug", totalCost: 15, count: 3 }])
      .mockResolvedValueOnce([{ category: "bug", totalCost: 1, count: 1 }]);

    const useCase = new GetCostStatsUseCase(
      repoRepository,
      commentRepository,
      commentReplyRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      period: "30d",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const breakdownTotal = result.value.breakdown.reduce((sum, entry) => sum + entry.totalCost, 0);
    expect(result.value.totalCost).toBe(breakdownTotal);
    expect(result.value.totalCost).toBe(40);

    const byRunTypeTotal = result.value.totalCostByRunType.reduce(
      (sum, entry) => sum + entry.totalCost,
      0,
    );
    expect(byRunTypeTotal).toBe(result.value.totalCost);
    expect(result.value.totalCostByRunType).toEqual([
      { runType: "review", totalCost: 25, count: 6 },
      { runType: "comment_reply", totalCost: 15, count: 3 },
    ]);

    // previous window: review 3 + reply 1 = 4
    expect(result.value.previousPeriod).toEqual({ totalCost: 4 });
  });

  it("queries the current and previous windows from getPeriodRange", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const commentRepository = mock<CommentRepository>();
    commentRepository.getCostByCategorySum.mockResolvedValue([]);
    const commentReplyRepository = mock<CommentReplyRepository>();
    commentReplyRepository.getCostByCategorySum.mockResolvedValue([]);

    const useCase = new GetCostStatsUseCase(
      repoRepository,
      commentRepository,
      commentReplyRepository,
    );

    await useCase.execute({ userId: "user-1", repoId: repo.id.value, period: "7d" });

    expect(commentRepository.getCostByCategorySum).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = commentRepository.getCostByCategorySum.mock.calls;
    expect(firstCall?.[0]).toBe(repo.id.value);
    expect(secondCall?.[0]).toBe(repo.id.value);
    // The previous window ends exactly where the current window starts.
    expect(secondCall?.[1].to).toEqual(firstCall?.[1].from);
  });
});
