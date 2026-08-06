import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Comment } from "../../../domain/entities/comment.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ListCommentsUseCase } from "./list-comments-use-case";

describe("ListCommentsUseCase", () => {
  it("returns repo_not_found when the repo doesn't belong to the user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new ListCommentsUseCase(
      repoRepository,
      mock<CommentRepository>(),
      mock<ReviewRunRepository>(),
    );

    const result = await useCase.execute({ userId: "user-1", repoId: "repo-1" });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
  });

  it("attaches the correct prNumber to each comment via a batched lookup", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const run1 = ReviewRun.create({
      repoId: repo.id.value,
      prNumber: 10,
      commitSha: "a",
      trigger: "action",
    });
    const run2 = ReviewRun.create({
      repoId: repo.id.value,
      prNumber: 20,
      commitSha: "b",
      trigger: "action",
    });
    const comment1 = Comment.create({
      reviewRunId: run1.id.value,
      reviewTurnId: "turn-1",
      file: "a.ts",
      line: 1,
      category: "bug",
      severity: "high",
      body: "x",
      kind: "observation",
    });
    const comment2 = Comment.create({
      reviewRunId: run2.id.value,
      reviewTurnId: "turn-2",
      file: "b.ts",
      line: 2,
      category: "security",
      severity: "critical",
      body: "y",
      kind: "observation",
    });

    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const commentRepository = mock<CommentRepository>();
    commentRepository.findByRepoId.mockResolvedValue({ comments: [comment1, comment2], total: 2 });
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findByIds.mockResolvedValue([run1, run2]);

    const useCase = new ListCommentsUseCase(repoRepository, commentRepository, reviewRunRepository);

    const result = await useCase.execute({ userId: "user-1", repoId: repo.id.value });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(reviewRunRepository.findByIds).toHaveBeenCalledWith([run1.id.value, run2.id.value]);
    expect(result.value.comments[0]).toMatchObject({ prNumber: 10 });
    expect(result.value.comments[1]).toMatchObject({ prNumber: 20 });
  });

  it("passes every filter through to the repository", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const commentRepository = mock<CommentRepository>();
    commentRepository.findByRepoId.mockResolvedValue({ comments: [], total: 0 });
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findByIds.mockResolvedValue([]);

    const useCase = new ListCommentsUseCase(repoRepository, commentRepository, reviewRunRepository);

    await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      prNumber: 42,
      category: "security",
      severity: "critical",
      status: "published",
      limit: 5,
      offset: 10,
    });

    expect(commentRepository.findByRepoId).toHaveBeenCalledWith(repo.id.value, {
      prNumber: 42,
      category: "security",
      severity: "critical",
      status: "published",
      limit: 5,
      offset: 10,
    });
  });
});
