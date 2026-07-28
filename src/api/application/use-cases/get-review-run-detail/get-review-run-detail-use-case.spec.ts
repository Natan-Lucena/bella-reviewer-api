import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Comment } from "../../../domain/entities/comment.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { ReviewTurn } from "../../../domain/entities/review-turn.entity";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReviewTurnRepository } from "../../../domain/repository/review-turn.repository";
import { GetReviewRunDetailUseCase } from "./get-review-run-detail-use-case";

describe("GetReviewRunDetailUseCase", () => {
  it("returns repo_not_found when the repo doesn't belong to the user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new GetReviewRunDetailUseCase(
      repoRepository,
      mock<ReviewRunRepository>(),
      mock<ReviewTurnRepository>(),
      mock<CommentRepository>(),
    );

    const result = await useCase.execute({ userId: "user-1", repoId: "repo-1", runId: "run-1" });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
  });

  it("returns review_run_not_found when the run doesn't exist", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findById.mockResolvedValue(null);
    const useCase = new GetReviewRunDetailUseCase(
      repoRepository,
      reviewRunRepository,
      mock<ReviewTurnRepository>(),
      mock<CommentRepository>(),
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      runId: "missing",
    });

    expect(result).toEqual({ ok: false, error: "review_run_not_found" });
  });

  it("returns review_run_not_found when the run belongs to a different repo", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const otherRepoRun = ReviewRun.create({
      repoId: "some-other-repo",
      prNumber: 1,
      commitSha: "x",
      trigger: "action",
    });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findById.mockResolvedValue(otherRepoRun);
    const useCase = new GetReviewRunDetailUseCase(
      repoRepository,
      reviewRunRepository,
      mock<ReviewTurnRepository>(),
      mock<CommentRepository>(),
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      runId: otherRepoRun.id.value,
    });

    expect(result).toEqual({ ok: false, error: "review_run_not_found" });
  });

  it("returns the run's turns and comments when everything matches", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const run = ReviewRun.create({
      repoId: repo.id.value,
      prNumber: 42,
      commitSha: "abc123",
      trigger: "action",
    });
    const turn = ReviewTurn.create({
      reviewRunId: run.id.value,
      index: 1,
      inputTokens: 100,
      outputTokens: 20,
      reasoningTokens: 5,
    });
    const comment = Comment.create({
      reviewRunId: run.id.value,
      reviewTurnId: turn.id.value,
      file: "a.ts",
      line: 1,
      category: "bug",
      severity: "high",
      body: "Looks wrong.",
    });

    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findById.mockResolvedValue(run);
    const reviewTurnRepository = mock<ReviewTurnRepository>();
    reviewTurnRepository.findByReviewRunId.mockResolvedValue([turn]);
    const commentRepository = mock<CommentRepository>();
    commentRepository.findByReviewRunId.mockResolvedValue([comment]);

    const useCase = new GetReviewRunDetailUseCase(
      repoRepository,
      reviewRunRepository,
      reviewTurnRepository,
      commentRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      runId: run.id.value,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(run.id.value);
    expect(result.value.turns).toHaveLength(1);
    expect(result.value.turns[0]?.index).toBe(1);
    expect(result.value.comments).toHaveLength(1);
    expect(result.value.comments[0]?.body).toBe("Looks wrong.");
  });
});
