import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Diff } from "../../../domain/ports/scm-adapter.port";
import { QueuePort } from "../../../domain/ports/queue.port";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReconcileSuggestionApplicationsUseCase } from "../reconcile-suggestion-applications/reconcile-suggestion-applications-use-case";
import { IngestActionUseCase } from "./ingest-action-use-case";

const emptyDiff: Diff = { files: [] };

function makeDeps() {
  const reviewRunRepository = mock<ReviewRunRepository>();
  const queue = mock<QueuePort>();
  const reconcileSuggestionApplicationsUseCase = mock<ReconcileSuggestionApplicationsUseCase>();
  reconcileSuggestionApplicationsUseCase.execute.mockResolvedValue({ ok: true, value: undefined });

  const useCase = new IngestActionUseCase(
    reviewRunRepository,
    queue,
    reconcileSuggestionApplicationsUseCase,
  );

  return { useCase, reviewRunRepository, queue, reconcileSuggestionApplicationsUseCase };
}

describe("IngestActionUseCase", () => {
  it("creates a new ReviewRun and publishes it to the queue when the commit hasn't been seen", async () => {
    const { useCase, reviewRunRepository, queue } = makeDeps();
    reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);

    const result = await useCase.execute({
      repoId: "repo-1",
      prNumber: 42,
      commitSha: "abc123",
      diff: emptyDiff,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isNew).toBe(true);
    expect(result.value.reviewRun.status).toBe("queued");
    expect(result.value.reviewRun.trigger).toBe("action");
    expect(reviewRunRepository.save).toHaveBeenCalledWith(result.value.reviewRun);

    expect(queue.publish).toHaveBeenCalledTimes(1);
    const publishCall = queue.publish.mock.calls[0][0];
    expect(publishCall.url).toContain(
      `/internal/review-runs/${result.value.reviewRun.id.value}/process`,
    );
    expect(publishCall.body).toEqual({ diff: emptyDiff });
    expect(publishCall.headers).toEqual({ Authorization: expect.stringMatching(/^Bearer .+/) });
  });

  it("includes prTitle/prDescription in the queued message when provided", async () => {
    const { useCase, reviewRunRepository, queue } = makeDeps();
    reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);

    await useCase.execute({
      repoId: "repo-1",
      prNumber: 42,
      commitSha: "abc123",
      diff: emptyDiff,
      prTitle: "Fix off-by-one in pagination",
      prDescription: "Callers in src/list.ts assumed the old (buggy) offset.",
    });

    const publishCall = queue.publish.mock.calls[0][0];
    expect(publishCall.body).toEqual({
      diff: emptyDiff,
      prTitle: "Fix off-by-one in pagination",
      prDescription: "Callers in src/list.ts assumed the old (buggy) offset.",
    });
  });

  it("returns the existing ReviewRun without creating a new one or re-publishing (idempotency)", async () => {
    const existing = ReviewRun.create({
      repoId: "repo-1",
      prNumber: 42,
      commitSha: "abc123",
      trigger: "action",
    });
    const { useCase, reviewRunRepository, queue } = makeDeps();
    reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(existing);

    const result = await useCase.execute({
      repoId: "repo-1",
      prNumber: 42,
      commitSha: "abc123",
      diff: emptyDiff,
    });

    expect(result).toEqual({ ok: true, value: { reviewRun: existing, isNew: false } });
    expect(reviewRunRepository.save).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });

  describe("suggestion reconciliation", () => {
    it("triggers reconciliation with the right params when previousCommitSha is present", async () => {
      const { useCase, reviewRunRepository, reconcileSuggestionApplicationsUseCase } = makeDeps();
      reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);

      await useCase.execute({
        repoId: "repo-1",
        prNumber: 42,
        commitSha: "new-sha",
        diff: emptyDiff,
        previousCommitSha: "old-sha",
      });

      expect(reconcileSuggestionApplicationsUseCase.execute).toHaveBeenCalledWith({
        repoId: "repo-1",
        prNumber: 42,
        previousCommitSha: "old-sha",
        newCommitSha: "new-sha",
      });
    });

    it("never triggers reconciliation when previousCommitSha is absent", async () => {
      const { useCase, reviewRunRepository, reconcileSuggestionApplicationsUseCase } = makeDeps();
      reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);

      await useCase.execute({
        repoId: "repo-1",
        prNumber: 42,
        commitSha: "new-sha",
        diff: emptyDiff,
      });

      expect(reconcileSuggestionApplicationsUseCase.execute).not.toHaveBeenCalled();
    });

    it("still creates the ReviewRun and responds normally when reconciliation rejects", async () => {
      const { useCase, reviewRunRepository, queue, reconcileSuggestionApplicationsUseCase } =
        makeDeps();
      reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);
      reconcileSuggestionApplicationsUseCase.execute.mockRejectedValue(
        new Error("GitHub transient error"),
      );

      const result = await useCase.execute({
        repoId: "repo-1",
        prNumber: 42,
        commitSha: "new-sha",
        diff: emptyDiff,
        previousCommitSha: "old-sha",
      });

      expect(result.ok).toBe(true);
      expect(reviewRunRepository.save).toHaveBeenCalledTimes(1);
      expect(queue.publish).toHaveBeenCalledTimes(1);
    });

    it("still creates the ReviewRun and responds normally when reconciliation resolves with a business failure", async () => {
      const { useCase, reviewRunRepository, reconcileSuggestionApplicationsUseCase } = makeDeps();
      reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);
      reconcileSuggestionApplicationsUseCase.execute.mockResolvedValue({
        ok: false,
        error: "scm_credential_missing",
      });

      const result = await useCase.execute({
        repoId: "repo-1",
        prNumber: 42,
        commitSha: "new-sha",
        diff: emptyDiff,
        previousCommitSha: "old-sha",
      });

      expect(result.ok).toBe(true);
      expect(reviewRunRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});
