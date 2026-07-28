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

  const useCase = new IngestWebhookUseCase(
    reviewRunRepository,
    repoRepository,
    credentialRepository,
    queue,
  );

  return { useCase, reviewRunRepository, repoRepository, credentialRepository, queue };
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
});
