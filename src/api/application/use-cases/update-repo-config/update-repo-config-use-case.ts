import { failure, Result, success } from "../../../../shared/core/result";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";

export type UpdateRepoConfigParams = {
  userId: string;
  repoId: string;
  model?: string;
  tokenLimit?: number;
  temperature?: number;
  enabledCategories?: string[];
  // Three-state, same as RepoConfig.update() — omitted (untouched), null
  // (clear), or a prompt id (select).
  promptId?: string | null;
};

export type UpdateRepoConfigError = "repo_not_found" | "prompt_not_found";

export class UpdateRepoConfigUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly repoConfigRepository: RepoConfigRepository,
    private readonly promptRepository: PromptRepository,
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

    // Only checks ownership when the client is actually selecting a prompt
    // (a string) — null (clear) and omitted (leave untouched) never need it.
    if (params.promptId) {
      const prompt = await this.promptRepository.findById(params.promptId);
      if (!prompt || prompt.userId !== params.userId) {
        return failure("prompt_not_found");
      }
    }

    const updatedConfig = existingConfig.update({
      model: params.model,
      tokenLimit: params.tokenLimit,
      temperature: params.temperature,
      enabledCategories: params.enabledCategories,
      // WRONG would be `promptId: params.promptId` unconditionally here —
      // that always includes the key, even when the client never sent it,
      // making "promptId" in props inside update() always true.
      ...("promptId" in params ? { promptId: params.promptId } : {}),
    });

    await this.repoConfigRepository.save(updatedConfig);

    return success(updatedConfig);
  }
}
