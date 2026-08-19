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
  promptId: string | null;
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
    const repoIds = repos.map((repo) => repo.id.value);

    // Two batched queries for the whole list, instead of two per repo.
    const [configs, credentials] = await Promise.all([
      this.repoConfigRepository.findByRepoIds(repoIds),
      this.credentialRepository.findAllByRepoIds(repoIds),
    ]);
    const configByRepoId = new Map(configs.map((config) => [config.repoId, config]));
    const credentialsByRepoId = new Map<string, typeof credentials>();
    for (const credential of credentials) {
      const existing = credentialsByRepoId.get(credential.repoId) ?? [];
      existing.push(credential);
      credentialsByRepoId.set(credential.repoId, existing);
    }

    const items = repos.map((repo) => {
      const config = configByRepoId.get(repo.id.value);
      return {
        id: repo.id.value,
        fullName: repo.fullName,
        active: repo.active,
        configComplete: isConfigComplete(credentialsByRepoId.get(repo.id.value) ?? []),
        // A Repo always gets a RepoConfig at creation time — these
        // fallbacks only guard against a data-consistency bug, not a
        // real "no config yet" case.
        llmProvider: config?.llmProvider ?? "gemini",
        model: config?.model ?? "",
        promptId: config?.promptId ?? null,
      };
    });

    return success({ repos: items });
  }
}
