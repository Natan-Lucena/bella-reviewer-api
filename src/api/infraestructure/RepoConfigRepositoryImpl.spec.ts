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
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
        enabledCategories: ["security", "bug"],
      });

      await repository.save(config);

      expect(prismaMock.repoConfig.upsert).toHaveBeenCalledWith({
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
    });

    it("persists a changed llmProvider on an existing row (the update: branch, not just create:)", async () => {
      const config = RepoConfig.create({
        repoId: "repo-1",
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
      }).update({ llmProvider: "claude", model: "claude-sonnet-4-5" });

      await repository.save(config);

      expect(prismaMock.repoConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ llmProvider: "claude" }),
        }),
      );
    });
  });

  describe("findByRepoId", () => {
    it("casts the Json enabledCategories column back into a string array", async () => {
      prismaMock.repoConfig.findUnique.mockResolvedValue({
        id: "88888888-8888-8888-8888-888888888888",
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
        id: "88888888-8888-8888-8888-888888888888",
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

  describe("findByRepoIds", () => {
    it("returns one row per matching repoId via a single IN query", async () => {
      prismaMock.repoConfig.findMany.mockResolvedValue([
        {
          id: "88888888-8888-8888-8888-888888888888",
          repoId: "repo-1",
          llmProvider: "gemini",
          model: "gemini-2.5-flash",
          tokenLimit: 100000,
          temperature: 0.2,
          enabledCategories: [],
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ]);

      const found = await repository.findByRepoIds(["repo-1", "repo-2"]);

      expect(prismaMock.repoConfig.findMany).toHaveBeenCalledWith({
        where: { repoId: { in: ["repo-1", "repo-2"] } },
      });
      expect(found).toHaveLength(1);
      expect(found[0]?.repoId).toBe("repo-1");
    });

    it("returns an empty array without querying when given no ids", async () => {
      const found = await repository.findByRepoIds([]);

      expect(found).toEqual([]);
      expect(prismaMock.repoConfig.findMany).not.toHaveBeenCalled();
    });
  });
});
