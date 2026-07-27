import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import type { PrismaClient } from "../../../generated/prisma";

vi.mock("../../shared/infra/database/relational/prisma-client", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { ReviewRun } from "../domain/entities/review-run.entity";
import { ReviewRunRepositoryImpl } from "./ReviewRunRepositoryImpl";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

const baseRow = {
  id: "run-1",
  repoId: "repo-1",
  prNumber: 42,
  commitSha: "abc123",
  trigger: "action" as const,
  status: "completed" as const,
  errorReason: null,
  totalInputTokens: 100,
  totalOutputTokens: 50,
  totalReasoningTokens: 10,
  estimatedCost: null,
  startedAt: new Date("2026-01-01T00:00:00Z"),
  completedAt: new Date("2026-01-01T00:01:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("ReviewRunRepositoryImpl", () => {
  const repository = new ReviewRunRepositoryImpl();

  describe("save", () => {
    it("upserts by id with the entity's fields", async () => {
      const run = ReviewRun.create({
        repoId: "repo-1",
        prNumber: 42,
        commitSha: "abc123",
        trigger: "action",
      });

      await repository.save(run);

      expect(prismaMock.reviewRun.upsert).toHaveBeenCalledWith({
        where: { id: run.id },
        create: expect.objectContaining({ id: run.id, status: "queued" }),
        update: expect.objectContaining({ status: "queued" }),
      });
    });
  });

  describe("findById", () => {
    it("maps a null estimatedCost to null", async () => {
      prismaMock.reviewRun.findUnique.mockResolvedValue(baseRow);

      const found = await repository.findById("run-1");

      expect(found?.estimatedCost).toBeNull();
    });

    it("converts a Prisma.Decimal estimatedCost into a plain number", async () => {
      prismaMock.reviewRun.findUnique.mockResolvedValue({
        ...baseRow,
        estimatedCost: new Prisma.Decimal("0.0123"),
      });

      const found = await repository.findById("run-1");

      expect(found?.estimatedCost).toBe(0.0123);
    });

    it("returns null when no run is found", async () => {
      prismaMock.reviewRun.findUnique.mockResolvedValue(null);

      expect(await repository.findById("missing")).toBeNull();
    });
  });

  describe("findByRepoIdAndCommitSha", () => {
    it("looks up via the repoId_commitSha composite unique key", async () => {
      prismaMock.reviewRun.findUnique.mockResolvedValue(baseRow);

      const found = await repository.findByRepoIdAndCommitSha("repo-1", "abc123");

      expect(prismaMock.reviewRun.findUnique).toHaveBeenCalledWith({
        where: { repoId_commitSha: { repoId: "repo-1", commitSha: "abc123" } },
      });
      expect(found?.id).toBe("run-1");
    });

    it("returns null when the commit hasn't been processed yet", async () => {
      prismaMock.reviewRun.findUnique.mockResolvedValue(null);

      expect(await repository.findByRepoIdAndCommitSha("repo-1", "unknown-sha")).toBeNull();
    });
  });

  describe("findByRepoId", () => {
    it("applies the status filter and pagination defaults", async () => {
      prismaMock.reviewRun.findMany.mockResolvedValue([baseRow]);
      prismaMock.reviewRun.count.mockResolvedValue(1);

      const result = await repository.findByRepoId("repo-1", { status: "completed" });

      expect(prismaMock.reviewRun.findMany).toHaveBeenCalledWith({
        where: { repoId: "repo-1", status: "completed" },
        orderBy: { createdAt: "desc" },
        take: 20,
        skip: 0,
      });
      expect(prismaMock.reviewRun.count).toHaveBeenCalledWith({
        where: { repoId: "repo-1", status: "completed" },
      });
      expect(result).toEqual({ reviewRuns: [expect.objectContaining({ id: "run-1" })], total: 1 });
    });

    it("omits the status filter when none is provided", async () => {
      prismaMock.reviewRun.findMany.mockResolvedValue([]);
      prismaMock.reviewRun.count.mockResolvedValue(0);

      await repository.findByRepoId("repo-1", { limit: 5, offset: 10 });

      expect(prismaMock.reviewRun.findMany).toHaveBeenCalledWith({
        where: { repoId: "repo-1" },
        orderBy: { createdAt: "desc" },
        take: 5,
        skip: 10,
      });
    });
  });
});
