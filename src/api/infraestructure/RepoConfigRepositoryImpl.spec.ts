import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import type { PrismaClient } from "../../../generated/prisma";

vi.mock("../../shared/infra/database/relational/prisma-client", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { RepoConfig } from "../domain/entities/repo-config.entity";
import { RepoConfigRepositoryImpl } from "./RepoConfigRepositoryImpl";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe("RepoConfigRepositoryImpl", () => {
  const repository = new RepoConfigRepositoryImpl();

  describe("save", () => {
    it("upserts by id, sending enabledCategories as-is (Json column)", async () => {
      const config = RepoConfig.create({
        repoId: "repo-1",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
        enabledCategories: ["security", "bug"],
      });

      await repository.save(config);

      expect(prismaMock.repoConfig.upsert).toHaveBeenCalledWith({
        where: { id: config.id },
        create: {
          id: config.id,
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
          model: config.model,
          tokenLimit: config.tokenLimit,
          temperature: config.temperature,
          enabledCategories: config.enabledCategories,
        },
      });
    });
  });

  describe("findByRepoId", () => {
    it("casts the Json enabledCategories column back into a string array", async () => {
      prismaMock.repoConfig.findUnique.mockResolvedValue({
        id: "config-1",
        repoId: "repo-1",
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
        temperature: 0.2,
        enabledCategories: ["security", "bug"],
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const found = await repository.findByRepoId("repo-1");

      expect(prismaMock.repoConfig.findUnique).toHaveBeenCalledWith({
        where: { repoId: "repo-1" },
      });
      expect(found?.enabledCategories).toEqual(["security", "bug"]);
    });

    it("defaults enabledCategories to an empty array when the column is null", async () => {
      prismaMock.repoConfig.findUnique.mockResolvedValue({
        id: "config-1",
        repoId: "repo-1",
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
        temperature: 0.2,
        enabledCategories: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const found = await repository.findByRepoId("repo-1");

      expect(found?.enabledCategories).toEqual([]);
    });

    it("returns null when no config exists for the repo", async () => {
      prismaMock.repoConfig.findUnique.mockResolvedValue(null);

      expect(await repository.findByRepoId("repo-without-config")).toBeNull();
    });
  });
});
