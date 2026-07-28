import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { Credential, CredentialType } from "../domain/entities/credential.entity";
import { CredentialRepository } from "../domain/repository/credential.repository";

export class CredentialRepositoryImpl implements CredentialRepository {
  async save(credential: Credential): Promise<void> {
    await prisma.credential.upsert({
      where: { id: credential.id.value },
      create: {
        id: credential.id.value,
        repoId: credential.repoId,
        type: credential.type,
        provider: credential.provider,
        encryptedSecret: credential.encryptedSecret,
        secretHash: credential.secretHash,
        scopes: credential.scopes,
        lastValidatedAt: credential.lastValidatedAt,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
      },
      update: {
        encryptedSecret: credential.encryptedSecret,
        secretHash: credential.secretHash,
        scopes: credential.scopes,
        lastValidatedAt: credential.lastValidatedAt,
      },
    });
  }

  async findByRepoIdAndType(repoId: string, type: CredentialType): Promise<Credential | null> {
    const row = await prisma.credential.findUnique({
      where: { repoId_type: { repoId, type } },
    });
    return row ? Credential.fromPersistence(row) : null;
  }

  async findByHash(secretHash: string): Promise<Credential | null> {
    const row = await prisma.credential.findFirst({ where: { secretHash } });
    return row ? Credential.fromPersistence(row) : null;
  }

  async findAllByRepoId(repoId: string): Promise<Credential[]> {
    const rows = await prisma.credential.findMany({ where: { repoId } });
    return rows.map((row) => Credential.fromPersistence(row));
  }

  async findAllByRepoIds(repoIds: string[]): Promise<Credential[]> {
    if (repoIds.length === 0) {
      return [];
    }
    const rows = await prisma.credential.findMany({ where: { repoId: { in: repoIds } } });
    return rows.map((row) => Credential.fromPersistence(row));
  }
}
