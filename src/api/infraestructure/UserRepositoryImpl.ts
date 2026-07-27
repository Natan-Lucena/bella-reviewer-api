import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { User } from "../domain/entities/user.entity";
import { UserRepository } from "../domain/repository/user.repository";

export class UserRepositoryImpl implements UserRepository {
  async save(user: User): Promise<void> {
    await prisma.user.upsert({
      where: { id: user.id.value },
      create: {
        id: user.id.value,
        email: user.email,
        passwordHash: user.passwordHash,
        createdAt: user.createdAt,
      },
      update: {
        email: user.email,
        passwordHash: user.passwordHash,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? User.fromPersistence(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { email } });
    return row ? User.fromPersistence(row) : null;
  }
}
