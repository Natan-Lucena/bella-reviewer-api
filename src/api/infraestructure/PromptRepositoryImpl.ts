import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { Prompt } from "../domain/entities/prompt.entity";
import { PromptRepository } from "../domain/repository/prompt.repository";

type PromptRow = {
  id: string;
  userId: string;
  name: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: PromptRow): Prompt {
  return Prompt.fromPersistence(row);
}

export class PromptRepositoryImpl implements PromptRepository {
  async save(prompt: Prompt): Promise<void> {
    await prisma.prompt.upsert({
      where: { id: prompt.id.value },
      create: {
        id: prompt.id.value,
        userId: prompt.userId,
        name: prompt.name,
        content: prompt.content,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
      },
      update: {
        name: prompt.name,
        content: prompt.content,
      },
    });
  }

  async findById(id: string): Promise<Prompt | null> {
    const row = await prisma.prompt.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByUserId(userId: string): Promise<Prompt[]> {
    const rows = await prisma.prompt.findMany({ where: { userId } });
    return rows.map(toDomain);
  }

  async findByUserIdAndName(userId: string, name: string): Promise<Prompt | null> {
    const row = await prisma.prompt.findFirst({ where: { userId, name } });
    return row ? toDomain(row) : null;
  }

  async delete(id: string): Promise<void> {
    await prisma.prompt.delete({ where: { id } });
  }
}
