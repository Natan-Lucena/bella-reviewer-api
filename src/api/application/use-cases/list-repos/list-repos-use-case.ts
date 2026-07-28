import { Result, success } from "../../../../shared/core/result";
import { isConfigComplete } from "../../../domain/services/repo-config-completeness";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";

export type ListReposParams = {
  userId: string;
};

export type ListReposResultItem = {
  id: string;
  fullName: string;
  active: boolean;
  configComplete: boolean;
  llmProvider: string;
  model: string;
};

export type ListReposResult = {
  repos: ListReposResultItem[];
};

export class ListReposUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly repoConfigRepository: RepoConfigRepository,
    private readonly credentialRepository: CredentialRepository,
  ) {}

  async execute(params: ListReposParams): Promise<Result<ListReposResult, never>> {
    const repos = await this.repoRepository.findByUserId(params.userId);

    const items = await Promise.all(
      repos.map(async (repo) => {
        const [config, credentials] = await Promise.all([
          this.repoConfigRepository.findByRepoId(repo.id.value),
          this.credentialRepository.findAllByRepoId(repo.id.value),
        ]);

        return {
          id: repo.id.value,
          fullName: repo.fullName,
          active: repo.active,
          configComplete: isConfigComplete(credentials),
          // A Repo always gets a RepoConfig at creation time — these
          // fallbacks only guard against a data-consistency bug, not a
          // real "no config yet" case.
          llmProvider: config?.llmProvider ?? "gemini",
          model: config?.model ?? "",
        };
      }),
    );

    return success({ repos: items });
  }
}
