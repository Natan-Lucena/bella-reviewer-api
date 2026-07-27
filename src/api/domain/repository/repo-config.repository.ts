import { RepoConfig } from "../entities/repo-config.entity";

export interface RepoConfigRepository {
  save(config: RepoConfig): Promise<void>;
  findByRepoId(repoId: string): Promise<RepoConfig | null>;
}
