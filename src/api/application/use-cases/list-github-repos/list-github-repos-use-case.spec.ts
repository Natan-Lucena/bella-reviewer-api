import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

const listReposMock = vi.fn();

// This use case builds the adapter itself from the raw pat it received —
// same pattern as ProcessReviewRunUseCase, see its spec for the rationale.
vi.mock("../../../integration/github/github-scm-adapter", () => ({
  GithubScmAdapter: vi.fn().mockImplementation(() => ({ listRepos: listReposMock })),
}));

import { Repo } from "../../../domain/entities/repo.entity";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { GithubScmAdapterError } from "../../../integration/github/github-error";
import { ListGithubReposUseCase } from "./list-github-repos-use-case";

describe("ListGithubReposUseCase", () => {
  it("returns the repos sorted by name, flagging the ones already added", async () => {
    listReposMock.mockResolvedValue([
      { fullName: "org/zeta", private: false, defaultBranch: "main" },
      { fullName: "org/alpha", private: true, defaultBranch: "main" },
    ]);
    const repoRepository = mock<RepoRepository>();
    repoRepository.findByUserId.mockResolvedValue([
      Repo.create({ userId: "user-1", fullName: "org/alpha" }),
    ]);
    const useCase = new ListGithubReposUseCase(repoRepository);

    const result = await useCase.execute({ userId: "user-1", pat: "ghp_token" });

    expect(result).toEqual({
      ok: true,
      value: [
        { fullName: "org/alpha", private: true, defaultBranch: "main", alreadyAdded: true },
        { fullName: "org/zeta", private: false, defaultBranch: "main", alreadyAdded: false },
      ],
    });
  });

  it("maps a 429 from GitHub to github_rate_limited", async () => {
    listReposMock.mockRejectedValue(new GithubScmAdapterError("transient", 429, "rate limited"));
    const useCase = new ListGithubReposUseCase(mock<RepoRepository>());

    const result = await useCase.execute({ userId: "user-1", pat: "bad-pat" });

    expect(result).toEqual({ ok: false, error: "github_rate_limited" });
  });

  it("maps any other GitHub error to github_auth_failed", async () => {
    listReposMock.mockRejectedValue(new GithubScmAdapterError("permanent", 401, "bad credentials"));
    const useCase = new ListGithubReposUseCase(mock<RepoRepository>());

    const result = await useCase.execute({ userId: "user-1", pat: "bad-pat" });

    expect(result).toEqual({ ok: false, error: "github_auth_failed" });
  });
});
