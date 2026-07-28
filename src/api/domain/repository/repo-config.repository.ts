import { RepoConfig } from "../entities/repo-config.entity";

export interface RepoConfigRepository {
  save(config: RepoConfig): Promise<void>;
  findByRepoId(repoId: string): Promise<RepoConfig | null>;
  // One batched query for a whole page of repos, instead of one query per
  // repo — powers the repo list's llmProvider/model fields.
  findByRepoIds(repoIds: string[]): Promise<RepoConfig[]>;
}
