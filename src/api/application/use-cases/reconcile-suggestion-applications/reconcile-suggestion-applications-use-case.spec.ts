import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

const reconcileMock = vi.fn();
vi.mock("../../../domain/services/reconcile-suggestion-applications", () => ({
  reconcileSuggestionApplications: (...args: unknown[]) => reconcileMock(...args),
}));
vi.mock("../../../integration/github/github-scm-adapter", () => ({
  GithubScmAdapter: vi.fn().mockImplementation(() => ({})),
}));

import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { CommentApplyEventRepository } from "../../../domain/repository/comment-apply-event.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReconcileSuggestionApplicationsUseCase } from "./reconcile-suggestion-applications-use-case";

function makeDeps() {
  const repoRepository = mock<RepoRepository>();
  const credentialRepository = mock<CredentialRepository>();
  const commentRepository = mock<CommentRepository>();
  const commentApplyEventRepository = mock<CommentApplyEventRepository>();

  const useCase = new ReconcileSuggestionApplicationsUseCase(
    repoRepository,
    credentialRepository,
    commentRepository,
    commentApplyEventRepository,
  );

  return {
    useCase,
    repoRepository,
    credentialRepository,
    commentRepository,
    commentApplyEventRepository,
  };
}

describe("ReconcileSuggestionApplicationsUseCase", () => {
  it("returns repo_not_found when the repo doesn't exist", async () => {
    const { useCase, repoRepository, credentialRepository } = makeDeps();
    repoRepository.findById.mockResolvedValue(null);
    credentialRepository.findByRepoIdAndType.mockResolvedValue(
      Credential.createScm({ repoId: "repo-1", encryptedSecret: encrypt("pat") }),
    );

    const result = await useCase.execute({
      repoId: "repo-1",
      prNumber: 42,
      previousCommitSha: "a",
      newCommitSha: "b",
    });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("returns scm_credential_missing when there's no SCM credential", async () => {
    const { useCase, repoRepository, credentialRepository } = makeDeps();
    repoRepository.findById.mockResolvedValue(
      Repo.create({ userId: "user-1", fullName: "org/repo" }),
    );
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);

    const result = await useCase.execute({
      repoId: "repo-1",
      prNumber: 42,
      previousCommitSha: "a",
      newCommitSha: "b",
    });

    expect(result).toEqual({ ok: false, error: "scm_credential_missing" });
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("calls reconcileSuggestionApplications with the resolved repo and returns ok", async () => {
    const { useCase, repoRepository, credentialRepository } = makeDeps();
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    repoRepository.findById.mockResolvedValue(repo);
    credentialRepository.findByRepoIdAndType.mockResolvedValue(
      Credential.createScm({ repoId: repo.id.value, encryptedSecret: encrypt("pat") }),
    );
    reconcileMock.mockResolvedValue(undefined);

    const result = await useCase.execute({
      repoId: repo.id.value,
      prNumber: 42,
      previousCommitSha: "before-sha",
      newCommitSha: "after-sha",
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(reconcileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repoFullName: "org/repo",
        repoId: repo.id.value,
        prNumber: 42,
        previousCommitSha: "before-sha",
        newCommitSha: "after-sha",
      }),
    );
  });
});
