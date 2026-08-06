import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Comment } from "../../../domain/entities/comment.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { CommentApplyEventRepository } from "../../../domain/repository/comment-apply-event.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { FinalizeSuggestionReconciliationUseCase } from "./finalize-suggestion-reconciliation-use-case";

function makePendingComment(reviewRunId: string): Comment {
  const comment = Comment.create({
    reviewRunId,
    reviewTurnId: "turn-1",
    file: "src/a.ts",
    line: 1,
    category: "bug",
    severity: "high",
    body: "Off-by-one.",
    kind: "actionable",
    suggestedCode: "return items[i - 1];",
  });
  comment.status = "published";
  comment.externalId = "gh-1";
  return comment;
}

function makeDeps() {
  const repoRepository = mock<RepoRepository>();
  const commentRepository = mock<CommentRepository>();
  const commentApplyEventRepository = mock<CommentApplyEventRepository>();

  const useCase = new FinalizeSuggestionReconciliationUseCase(
    repoRepository,
    commentRepository,
    commentApplyEventRepository,
  );

  return { useCase, repoRepository, commentRepository, commentApplyEventRepository };
}

describe("FinalizeSuggestionReconciliationUseCase", () => {
  it("returns repo_not_found when the repo doesn't exist", async () => {
    const { useCase, repoRepository, commentRepository } = makeDeps();
    repoRepository.findById.mockResolvedValue(null);

    const result = await useCase.execute({
      repoId: "repo-1",
      prNumber: 42,
      finalCommitSha: "sha",
    });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
    expect(commentRepository.findPendingSuggestionsByRepoIdAndPrNumber).not.toHaveBeenCalled();
  });

  it("marks every pending suggestion (from any ReviewRun of the PR) as not_applied", async () => {
    const { useCase, repoRepository, commentRepository, commentApplyEventRepository } = makeDeps();
    repoRepository.findById.mockResolvedValue(
      Repo.create({ userId: "user-1", fullName: "org/repo" }),
    );
    const commentFromRunA = makePendingComment("run-a");
    const commentFromRunB = makePendingComment("run-b");
    commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([
      commentFromRunA,
      commentFromRunB,
    ]);

    const result = await useCase.execute({
      repoId: "repo-1",
      prNumber: 42,
      finalCommitSha: "final-sha",
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(commentRepository.save).toHaveBeenCalledTimes(2);
    const saved = commentRepository.save.mock.calls.map((call) => call[0]);
    expect(saved.every((c) => c.applyStatus === "not_applied")).toBe(true);
    expect(saved.every((c) => c.detectionMethod === "pr_closed")).toBe(true);
    expect(saved.every((c) => c.appliedAtCommit === "final-sha")).toBe(true);
    expect(commentApplyEventRepository.save).toHaveBeenCalledTimes(2);
  });

  it("does nothing when there are no pending suggestions for the PR", async () => {
    const { useCase, repoRepository, commentRepository, commentApplyEventRepository } = makeDeps();
    repoRepository.findById.mockResolvedValue(
      Repo.create({ userId: "user-1", fullName: "org/repo" }),
    );
    commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([]);

    const result = await useCase.execute({
      repoId: "repo-1",
      prNumber: 42,
      finalCommitSha: "final-sha",
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(commentRepository.save).not.toHaveBeenCalled();
    expect(commentApplyEventRepository.save).not.toHaveBeenCalled();
  });
});
