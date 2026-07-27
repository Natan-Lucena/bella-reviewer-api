import { config } from "../../../../config";
import { Result, success } from "../../../../shared/core/result";
import { Repo } from "../../../domain/entities/repo.entity";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";

export type CreateRepoParams = {
  userId: string;
  fullName: string;
};

export type CreateRepoResult = {
  repo: Repo;
  config: RepoConfig;
};

// No failure mode today (fullName format is validated by the schema, and
// there's no global-uniqueness check — see
// backend-prds/03-gerenciamento-repositorio.md). Still returns a Result to
// keep the same shape every other use case/controller pair follows.
export type CreateRepoError = never;

export class CreateRepoUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly repoConfigRepository: RepoConfigRepository,
  ) {}

  async execute(params: CreateRepoParams): Promise<Result<CreateRepoResult, CreateRepoError>> {
    const repo = Repo.create({ userId: params.userId, fullName: params.fullName });
    await this.repoRepository.save(repo);

    const repoConfig = RepoConfig.create({
      repoId: repo.id.value,
      model: config.DEFAULT_LLM_MODEL,
      tokenLimit: config.DEFAULT_TOKEN_LIMIT,
    });
    await this.repoConfigRepository.save(repoConfig);

    return success({ repo, config: repoConfig });
  }
}
