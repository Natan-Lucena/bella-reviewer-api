import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import type { PrismaClient } from "../../../generated/prisma";

vi.mock("../../shared/infra/database/relational/prisma-client", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { Credential } from "../domain/entities/credential.entity";
import { CredentialRepositoryImpl } from "./CredentialRepositoryImpl";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe("CredentialRepositoryImpl", () => {
  const repository = new CredentialRepositoryImpl();

  describe("save", () => {
    it("upserts a reversible (encrypted) credential", async () => {
      const credential = Credential.createEncrypted({
        repoId: "repo-1",
        type: "llm",
        provider: "gemini",
        encryptedSecret: "cipher-text",
      });

      await repository.save(credential);

      expect(prismaMock.credential.upsert).toHaveBeenCalledWith({
        where: { id: credential.id.value },
        create: {
          id: credential.id.value,
          repoId: credential.repoId,
          type: credential.type,
          provider: credential.provider,
          encryptedSecret: "cipher-text",
          secretHash: null,
          scopes: null,
          lastValidatedAt: null,
          createdAt: credential.createdAt,
          updatedAt: credential.updatedAt,
        },
        update: {
          encryptedSecret: "cipher-text",
          secretHash: null,
          scopes: null,
          lastValidatedAt: null,
        },
      });
    });

    it("upserts a hashed (irreversible) credential", async () => {
      const credential = Credential.createHashed({
        repoId: "repo-1",
        type: "action_token",
        provider: "github",
        secretHash: "hash-value",
      });

      await repository.save(credential);

      expect(prismaMock.credential.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            type: "action_token",
            encryptedSecret: null,
            secretHash: "hash-value",
          }),
        }),
      );
    });
  });

  describe("findByRepoIdAndType", () => {
    it("looks up via the repoId_type composite unique key", async () => {
      const row = {
        id: "66666666-6666-6666-6666-666666666666",
        repoId: "repo-1",
        type: "llm" as const,
        provider: "gemini" as const,
        encryptedSecret: "cipher-text",
        secretHash: null,
        scopes: null,
        lastValidatedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      };
      prismaMock.credential.findUnique.mockResolvedValue(row);

      const found = await repository.findByRepoIdAndType("repo-1", "llm");

      expect(prismaMock.credential.findUnique).toHaveBeenCalledWith({
        where: { repoId_type: { repoId: "repo-1", type: "llm" } },
      });
      expect(found?.encryptedSecret).toBe("cipher-text");
    });

    it("returns null when the repo has no credential of that type", async () => {
      prismaMock.credential.findUnique.mockResolvedValue(null);

      expect(await repository.findByRepoIdAndType("repo-1", "scm")).toBeNull();
    });
  });

  describe("findByHash", () => {
    it("finds the credential by secretHash", async () => {
      const row = {
        id: "77777777-7777-7777-7777-777777777777",
        repoId: "repo-1",
        type: "action_token" as const,
        provider: "github" as const,
        encryptedSecret: null,
        secretHash: "hash-value",
        scopes: null,
        lastValidatedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      };
      prismaMock.credential.findFirst.mockResolvedValue(row);

      const found = await repository.findByHash("hash-value");

      expect(prismaMock.credential.findFirst).toHaveBeenCalledWith({
        where: { secretHash: "hash-value" },
      });
      expect(found?.repoId).toBe("repo-1");
    });

    it("returns null when no credential matches the hash", async () => {
      prismaMock.credential.findFirst.mockResolvedValue(null);

      expect(await repository.findByHash("unknown-hash")).toBeNull();
    });
  });
});
