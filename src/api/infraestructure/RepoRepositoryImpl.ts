import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { Repo } from "../domain/entities/repo.entity";
import { RepoRepository } from "../domain/repository/repo.repository";

export class RepoRepositoryImpl implements RepoRepository {
  async save(repo: Repo): Promise<void> {
    await prisma.repo.upsert({
      where: { id: repo.id.value },
      create: {
        id: repo.id.value,
        userId: repo.userId,
        scmProvider: repo.scmProvider,
        fullName: repo.fullName,
        active: repo.active,
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt,
      },
      update: {
        fullName: repo.fullName,
        active: repo.active,
      },
    });
  }

  async findById(id: string): Promise<Repo | null> {
    const row = await prisma.repo.findUnique({ where: { id } });
    return row ? Repo.fromPersistence(row) : null;
  }

  async findByUserId(userId: string): Promise<Repo[]> {
    const rows = await prisma.repo.findMany({ where: { userId } });
    return rows.map((row) => Repo.fromPersistence(row));
  }

  async findByFullName(fullName: string): Promise<Repo | null> {
    const row = await prisma.repo.findFirst({ where: { fullName } });
    return row ? Repo.fromPersistence(row) : null;
  }
}
