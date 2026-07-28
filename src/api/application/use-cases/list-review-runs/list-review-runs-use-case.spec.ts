import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Repo } from "../../../domain/entities/repo.entity";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ListReviewRunsUseCase } from "./list-review-runs-use-case";

describe("ListReviewRunsUseCase", () => {
  it("returns repo_not_found when the repo doesn't belong to the user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new ListReviewRunsUseCase(
      repoRepository,
      mock<ReviewRunRepository>(),
      mock<CommentRepository>(),
    );

    const result = await useCase.execute({ userId: "user-1", repoId: "repo-1" });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
  });

  it("computes durationMs, commentCount, and totalTokens per run", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);

    const run = ReviewRun.create({
      repoId: repo.id.value,
      prNumber: 42,
      commitSha: "abc123",
      trigger: "action",
    });
    run.startedAt = new Date("2026-01-01T00:00:00Z");
    run.completedAt = new Date("2026-01-01T00:00:15Z");
    run.totalInputTokens = 100;
    run.totalOutputTokens = 20;
    run.totalReasoningTokens = 5;

    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findByRepoId.mockResolvedValue({ reviewRuns: [run], total: 1 });
    const commentRepository = mock<CommentRepository>();
    commentRepository.countPublishedByReviewRunIds.mockResolvedValue({ [run.id.value]: 3 });

    const useCase = new ListReviewRunsUseCase(
      repoRepository,
      reviewRunRepository,
      commentRepository,
    );

    const result = await useCase.execute({ userId: "user-1", repoId: repo.id.value });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total).toBe(1);
    expect(result.value.reviewRuns[0]).toMatchObject({
      id: run.id.value,
      durationMs: 15000,
      commentCount: 3,
      totalTokens: 125,
    });
  });

  it("returns null durationMs and 0 commentCount for a run that hasn't finished", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const run = ReviewRun.create({
      repoId: repo.id.value,
      prNumber: 1,
      commitSha: "x",
      trigger: "action",
    });
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findByRepoId.mockResolvedValue({ reviewRuns: [run], total: 1 });
    const commentRepository = mock<CommentRepository>();
    commentRepository.countPublishedByReviewRunIds.mockResolvedValue({});

    const useCase = new ListReviewRunsUseCase(
      repoRepository,
      reviewRunRepository,
      commentRepository,
    );

    const result = await useCase.execute({ userId: "user-1", repoId: repo.id.value });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reviewRuns[0]).toMatchObject({ durationMs: null, commentCount: 0 });
  });

  it("passes status/limit/offset through to the repository", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findByRepoId.mockResolvedValue({ reviewRuns: [], total: 0 });
    const commentRepository = mock<CommentRepository>();
    commentRepository.countPublishedByReviewRunIds.mockResolvedValue({});

    const useCase = new ListReviewRunsUseCase(
      repoRepository,
      reviewRunRepository,
      commentRepository,
    );

    await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      status: "failed",
      limit: 5,
      offset: 10,
    });

    expect(reviewRunRepository.findByRepoId).toHaveBeenCalledWith(repo.id.value, {
      status: "failed",
      limit: 5,
      offset: 10,
    });
  });
});
