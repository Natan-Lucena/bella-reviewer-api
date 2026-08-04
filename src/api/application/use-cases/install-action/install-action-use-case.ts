import { failure, Result, success } from "../../../../shared/core/result";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";
import { GithubScmAdapterError } from "../../../integration/github/github-error";
import { GithubScmAdapter } from "../../../integration/github/github-scm-adapter";

export type InstallActionParams = {
  userId: string;
  repoId: string;
  pat: string;
};

export type InstallActionResult = {
  prUrl: string;
};

export type InstallActionError =
  "repo_not_found" | "github_auth_failed" | "github_insufficient_scope";

export class InstallActionUseCase {
  constructor(private readonly repoRepository: RepoRepository) {}

  async execute(
    params: InstallActionParams,
  ): Promise<Result<InstallActionResult, InstallActionError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    const adapter = new GithubScmAdapter(params.pat);
    try {
      const result = await adapter.openWorkflowInstallationPr({ repoFullName: repo.fullName });
      return success(result);
    } catch (error) {
      if (error instanceof GithubScmAdapterError && error.statusCode === 403) {
        return failure("github_insufficient_scope");
      }
      if (error instanceof GithubScmAdapterError) {
        return failure("github_auth_failed");
      }
      throw error;
    }
  }
}
