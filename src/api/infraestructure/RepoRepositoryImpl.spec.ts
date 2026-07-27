import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import type { PrismaClient } from "../../../generated/prisma";

vi.mock("../../shared/infra/database/relational/prisma-client", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { Repo } from "../domain/entities/repo.entity";
import { RepoRepositoryImpl } from "./RepoRepositoryImpl";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const REPO_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  mockReset(prismaMock);
});

const row = {
  id: REPO_ID,
  userId: "user-1",
  scmProvider: "github" as const,
  fullName: "org/repo",
  active: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("RepoRepositoryImpl", () => {
  const repository = new RepoRepositoryImpl();

  describe("save", () => {
    it("upserts by id with the entity's fields", async () => {
      const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });

      await repository.save(repo);

      expect(prismaMock.repo.upsert).toHaveBeenCalledWith({
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
    });
  });

  describe("findById", () => {
    it("maps the persisted row to a Repo entity", async () => {
      prismaMock.repo.findUnique.mockResolvedValue(row);

      const found = await repository.findById(REPO_ID);

      expect(prismaMock.repo.findUnique).toHaveBeenCalledWith({ where: { id: REPO_ID } });
      expect(found?.fullName).toBe("org/repo");
    });

    it("returns null when no row is found", async () => {
      prismaMock.repo.findUnique.mockResolvedValue(null);

      expect(await repository.findById("missing")).toBeNull();
    });
  });

  describe("findByUserId", () => {
    it("maps every row returned for the owner", async () => {
      prismaMock.repo.findMany.mockResolvedValue([row]);

      const found = await repository.findByUserId("user-1");

      expect(prismaMock.repo.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
      expect(found).toHaveLength(1);
      expect(found[0]?.id.value).toBe(REPO_ID);
    });

    it("returns an empty array when the user has no repos", async () => {
      prismaMock.repo.findMany.mockResolvedValue([]);

      expect(await repository.findByUserId("user-without-repos")).toEqual([]);
    });
  });

  describe("findByFullName", () => {
    it("finds the repo by its full name", async () => {
      prismaMock.repo.findFirst.mockResolvedValue(row);

      const found = await repository.findByFullName("org/repo");

      expect(prismaMock.repo.findFirst).toHaveBeenCalledWith({ where: { fullName: "org/repo" } });
      expect(found?.id.value).toBe(REPO_ID);
    });

    it("returns null when no repo matches", async () => {
      prismaMock.repo.findFirst.mockResolvedValue(null);

      expect(await repository.findByFullName("org/unknown")).toBeNull();
    });
  });
});
