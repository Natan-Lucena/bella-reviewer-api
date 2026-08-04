import { failure, Result, success } from "../../../../shared/core/result";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { GithubScmAdapterError } from "../../../integration/github/github-error";
import { GithubScmAdapter } from "../../../integration/github/github-scm-adapter";

export type ListGithubReposParams = {
  userId: string;
  pat: string;
};

export type GithubRepoOption = {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  alreadyAdded: boolean;
};

export type ListGithubReposError = "github_auth_failed" | "github_rate_limited";

export class ListGithubReposUseCase {
  constructor(private readonly repoRepository: RepoRepository) {}

  async execute(
    params: ListGithubReposParams,
  ): Promise<Result<GithubRepoOption[], ListGithubReposError>> {
    const adapter = new GithubScmAdapter(params.pat);

    let repos;
    try {
      repos = await adapter.listRepos();
    } catch (error) {
      if (error instanceof GithubScmAdapterError && error.statusCode === 429) {
        return failure("github_rate_limited");
      }
      if (error instanceof GithubScmAdapterError) {
        return failure("github_auth_failed");
      }
      throw error;
    }

    const existingRepos = await this.repoRepository.findByUserId(params.userId);
    const alreadyAddedFullNames = new Set(existingRepos.map((repo) => repo.fullName));

    const options: GithubRepoOption[] = repos
      .map((repo) => ({ ...repo, alreadyAdded: alreadyAddedFullNames.has(repo.fullName) }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return success(options);
  }
}
