import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

const openWorkflowInstallationPrMock = vi.fn();

// Same pattern as ProcessReviewRunUseCase/ListGithubReposUseCase: this use
// case builds the adapter itself from the raw pat it received.
vi.mock("../../../integration/github/github-scm-adapter", () => ({
  GithubScmAdapter: vi.fn().mockImplementation(() => ({
    openWorkflowInstallationPr: openWorkflowInstallationPrMock,
  })),
}));

import { Repo } from "../../../domain/entities/repo.entity";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { GithubScmAdapterError } from "../../../integration/github/github-error";
import { InstallActionUseCase } from "./install-action-use-case";

describe("InstallActionUseCase", () => {
  it("returns repo_not_found when the repo isn't owned by the requesting user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new InstallActionUseCase(repoRepository);

    const result = await useCase.execute({ userId: "user-1", repoId: "repo-1", pat: "ghp_token" });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
    expect(openWorkflowInstallationPrMock).not.toHaveBeenCalled();
  });

  it("opens the PR for the repo's fullName and returns the prUrl", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    openWorkflowInstallationPrMock.mockResolvedValue({
      prUrl: "https://github.com/org/repo/pull/1",
    });
    const useCase = new InstallActionUseCase(repoRepository);

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      pat: "ghp_token",
    });

    expect(result).toEqual({ ok: true, value: { prUrl: "https://github.com/org/repo/pull/1" } });
    expect(openWorkflowInstallationPrMock).toHaveBeenCalledWith({ repoFullName: "org/repo" });
  });

  it("maps a 403 from GitHub to github_insufficient_scope", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    openWorkflowInstallationPrMock.mockRejectedValue(
      new GithubScmAdapterError("permanent", 403, "insufficient scope"),
    );
    const useCase = new InstallActionUseCase(repoRepository);

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      pat: "ghp_token",
    });

    expect(result).toEqual({ ok: false, error: "github_insufficient_scope" });
  });

  it("maps any other GitHub error to github_auth_failed", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    openWorkflowInstallationPrMock.mockRejectedValue(
      new GithubScmAdapterError("permanent", 401, "bad credentials"),
    );
    const useCase = new InstallActionUseCase(repoRepository);

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      pat: "ghp_token",
    });

    expect(result).toEqual({ ok: false, error: "github_auth_failed" });
  });
});
