import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { RepoConfig } from "../domain/entities/repo-config.entity";
import { RepoConfigRepository } from "../domain/repository/repo-config.repository";

type RepoConfigRow = {
  id: string;
  repoId: string;
  llmProvider: string;
  model: string;
  tokenLimit: number;
  temperature: number;
  enabledCategories: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: RepoConfigRow): RepoConfig {
  return RepoConfig.fromPersistence({
    ...row,
    llmProvider: row.llmProvider as RepoConfig["llmProvider"],
    enabledCategories: (row.enabledCategories as string[] | null) ?? [],
  });
}

export class RepoConfigRepositoryImpl implements RepoConfigRepository {
  async save(config: RepoConfig): Promise<void> {
    await prisma.repoConfig.upsert({
      where: { id: config.id.value },
      create: {
        id: config.id.value,
        repoId: config.repoId,
        llmProvider: config.llmProvider,
        model: config.model,
        tokenLimit: config.tokenLimit,
        temperature: config.temperature,
        enabledCategories: config.enabledCategories,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
      update: {
        llmProvider: config.llmProvider,
        model: config.model,
        tokenLimit: config.tokenLimit,
        temperature: config.temperature,
        enabledCategories: config.enabledCategories,
      },
    });
  }

  async findByRepoId(repoId: string): Promise<RepoConfig | null> {
    const row = await prisma.repoConfig.findUnique({ where: { repoId } });
    return row ? toDomain(row) : null;
  }

  async findByRepoIds(repoIds: string[]): Promise<RepoConfig[]> {
    if (repoIds.length === 0) {
      return [];
    }
    const rows = await prisma.repoConfig.findMany({ where: { repoId: { in: repoIds } } });
    return rows.map(toDomain);
  }
}
