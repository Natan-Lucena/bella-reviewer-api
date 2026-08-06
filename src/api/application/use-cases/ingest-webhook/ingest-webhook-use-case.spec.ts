import { beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { Diff } from "../../../domain/ports/scm-adapter.port";
import { QueuePort } from "../../../domain/ports/queue.port";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReconcileSuggestionApplicationsUseCase } from "../reconcile-suggestion-applications/reconcile-suggestion-applications-use-case";
import { IngestWebhookUseCase } from "./ingest-webhook-use-case";

const emptyDiff: Diff = { files: [] };

const getDiffMock = vi.fn<() => Promise<Diff>>();

vi.mock("../../../integration/github/github-scm-adapter", () => ({
  GithubScmAdapter: vi.fn().mockImplementation(() => ({ getDiff: getDiffMock })),
}));

function makeDeps() {
  const reviewRunRepository = mock<ReviewRunRepository>();
  const repoRepository = mock<RepoRepository>();
  const credentialRepository = mock<CredentialRepository>();
  const queue = mock<QueuePort>();
  const reconcileSuggestionApplicationsUseCase = mock<ReconcileSuggestionApplicationsUseCase>();
  reconcileSuggestionApplicationsUseCase.execute.mockResolvedValue({ ok: true, value: undefined });

  const useCase = new IngestWebhookUseCase(
    reviewRunRepository,
    repoRepository,
    credentialRepository,
    queue,
    reconcileSuggestionApplicationsUseCase,
  );

  return {
    useCase,
    reviewRunRepository,
    repoRepository,
    credentialRepository,
    queue,
    reconcileSuggestionApplicationsUseCase,
  };
}

describe("IngestWebhookUseCase", () => {
  beforeEach(() => {
    getDiffMock.mockReset();
  });

  it("ignores an irrelevant action without touching the database or the queue", async () => {
    const { useCase, reviewRunRepository, queue } = makeDeps();

    const result = await useCase.execute({
      repoId: "repo-1",
      action: "labeled",
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Some PR",
    });

    expect(result).toEqual({ ok: true, value: { kind: "ignored" } });
    expect(reviewRunRepository.save).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });

  it("returns the existing run without re-fetching the diff (idempotency)", async () => {
    const existing = ReviewRun.create({
      repoId: "repo-1",
      prNumber: 42,
      commitSha: "abc123",
      trigger: "webhook",
    });
    const { useCase, reviewRunRepository, queue } = makeDeps();
    reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(existing);

    const result = await useCase.execute({
      repoId: "repo-1",
      action: "synchronize",
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Some PR",
    });

    expect(result).toEqual({
      ok: true,
      value: { kind: "accepted", reviewRun: existing, isNew: false },
    });
    expect(getDiffMock).not.toHaveBeenCalled();
    expect(reviewRunRepository.save).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });

  it("fetches the diff, creates the run, and publishes to the queue for a new commit", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const { useCase, reviewRunRepository, repoRepository, credentialRepository, queue } =
      makeDeps();
    reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);
    repoRepository.findById.mockResolvedValue(repo);
    credentialRepository.findByRepoIdAndType.mockResolvedValue(
      Credential.createScm({ repoId: repo.id.value, encryptedSecret: encrypt("github-pat") }),
    );
    getDiffMock.mockResolvedValue(emptyDiff);

    const result = await useCase.execute({
      repoId: repo.id.value,
      action: "opened",
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: "Details.",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("accepted");
    if (result.value.kind !== "accepted") return;
    expect(result.value.isNew).toBe(true);
    expect(result.value.reviewRun.trigger).toBe("webhook");
    expect(reviewRunRepository.save).toHaveBeenCalledWith(result.value.reviewRun);

    expect(getDiffMock).toHaveBeenCalledWith({
      repoFullName: "org/repo",
      prNumber: 42,
      commitSha: "abc123",
    });

    expect(queue.publish).toHaveBeenCalledTimes(1);
    const publishCall = queue.publish.mock.calls[0][0];
    expect(publishCall.url).toContain(
      `/internal/review-runs/${result.value.reviewRun.id.value}/process`,
    );
    expect(publishCall.body).toEqual({
      diff: emptyDiff,
      prTitle: "Fix bug",
      prDescription: "Details.",
    });
    expect(publishCall.headers).toEqual({ Authorization: expect.stringMatching(/^Bearer .+/) });
  });

  it("never creates a ReviewRun or publishes when getDiff fails", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const { useCase, reviewRunRepository, repoRepository, credentialRepository, queue } =
      makeDeps();
    reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);
    repoRepository.findById.mockResolvedValue(repo);
    credentialRepository.findByRepoIdAndType.mockResolvedValue(
      Credential.createScm({ repoId: repo.id.value, encryptedSecret: encrypt("github-pat") }),
    );
    getDiffMock.mockRejectedValue(new Error("GitHub rate limited"));

    await expect(
      useCase.execute({
        repoId: repo.id.value,
        action: "opened",
        prNumber: 42,
        commitSha: "abc123",
        prTitle: "Fix bug",
      }),
    ).rejects.toThrow("GitHub rate limited");

    expect(reviewRunRepository.save).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });

  describe("suggestion reconciliation", () => {
    function makeReadyDeps() {
      const deps = makeDeps();
      const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
      deps.reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);
      deps.repoRepository.findById.mockResolvedValue(repo);
      deps.credentialRepository.findByRepoIdAndType.mockResolvedValue(
        Credential.createScm({ repoId: repo.id.value, encryptedSecret: encrypt("github-pat") }),
      );
      getDiffMock.mockResolvedValue(emptyDiff);
      return deps;
    }

    it("triggers reconciliation with the right params on a synchronize event with a previous commit", async () => {
      const { useCase, reconcileSuggestionApplicationsUseCase } = makeReadyDeps();

      await useCase.execute({
        repoId: "repo-1",
        action: "synchronize",
        prNumber: 42,
        commitSha: "new-sha",
        prTitle: "Some PR",
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
      const { useCase, reconcileSuggestionApplicationsUseCase } = makeReadyDeps();

      await useCase.execute({
        repoId: "repo-1",
        action: "opened",
        prNumber: 42,
        commitSha: "new-sha",
        prTitle: "Some PR",
      });

      expect(reconcileSuggestionApplicationsUseCase.execute).not.toHaveBeenCalled();
    });

    it("never triggers reconciliation on opened, even if previousCommitSha were somehow present", async () => {
      const { useCase, reconcileSuggestionApplicationsUseCase } = makeReadyDeps();

      await useCase.execute({
        repoId: "repo-1",
        action: "opened",
        prNumber: 42,
        commitSha: "new-sha",
        prTitle: "Some PR",
        previousCommitSha: "old-sha",
      });

      expect(reconcileSuggestionApplicationsUseCase.execute).not.toHaveBeenCalled();
    });

    it("still creates the ReviewRun and responds normally when reconciliation rejects", async () => {
      const { useCase, reviewRunRepository, queue, reconcileSuggestionApplicationsUseCase } =
        makeReadyDeps();
      reconcileSuggestionApplicationsUseCase.execute.mockRejectedValue(
        new Error("GitHub transient error"),
      );

      const result = await useCase.execute({
        repoId: "repo-1",
        action: "synchronize",
        prNumber: 42,
        commitSha: "new-sha",
        prTitle: "Some PR",
        previousCommitSha: "old-sha",
      });

      expect(result.ok).toBe(true);
      expect(reviewRunRepository.save).toHaveBeenCalledTimes(1);
      expect(queue.publish).toHaveBeenCalledTimes(1);
    });

    it("still creates the ReviewRun and responds normally when reconciliation resolves with a business failure", async () => {
      const { useCase, reviewRunRepository, reconcileSuggestionApplicationsUseCase } =
        makeReadyDeps();
      reconcileSuggestionApplicationsUseCase.execute.mockResolvedValue({
        ok: false,
        error: "repo_not_found",
      });

      const result = await useCase.execute({
        repoId: "repo-1",
        action: "synchronize",
        prNumber: 42,
        commitSha: "new-sha",
        prTitle: "Some PR",
        previousCommitSha: "old-sha",
      });

      expect(result.ok).toBe(true);
      expect(reviewRunRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});
