import { failure, Result, success } from "../../../../shared/core/result";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";

export type UpdateRepoConfigParams = {
  userId: string;
  repoId: string;
  model?: string;
  tokenLimit?: number;
  temperature?: number;
  enabledCategories?: string[];
};

export type UpdateRepoConfigError = "repo_not_found";

export class UpdateRepoConfigUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly repoConfigRepository: RepoConfigRepository,
  ) {}

  async execute(
    params: UpdateRepoConfigParams,
  ): Promise<Result<RepoConfig, UpdateRepoConfigError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    // Every Repo gets a RepoConfig at creation time (CreateRepoUseCase) —
    // a repo passing the ownership check above but missing a config would
    // be a data-consistency bug, not a normal "not found" case, so this
    // isn't mapped to its own error literal.
    const existingConfig = await this.repoConfigRepository.findByRepoId(params.repoId);
    if (!existingConfig) {
      return failure("repo_not_found");
    }

    const updatedConfig = existingConfig.update({
      model: params.model,
      tokenLimit: params.tokenLimit,
      temperature: params.temperature,
      enabledCategories: params.enabledCategories,
    });

    await this.repoConfigRepository.save(updatedConfig);

    return success(updatedConfig);
  }
}
