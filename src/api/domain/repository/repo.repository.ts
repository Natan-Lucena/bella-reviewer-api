import { Repo } from "../entities/repo.entity";

export interface RepoRepository {
  save(repo: Repo): Promise<void>;
  findById(id: string): Promise<Repo | null>;
  findByUserId(userId: string): Promise<Repo[]>;
  findByFullName(fullName: string): Promise<Repo | null>;
}
