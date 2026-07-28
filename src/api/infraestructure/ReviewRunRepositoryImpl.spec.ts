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

const RUN_ID = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  mockReset(prismaMock);
});

const baseRow = {
  id: RUN_ID,
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
        where: { id: run.id.value },
        create: expect.objectContaining({ id: run.id.value, status: "queued" }),
        update: expect.objectContaining({ status: "queued" }),
      });
    });
  });

  describe("findById", () => {
    it("maps a null estimatedCost to null", async () => {
      prismaMock.reviewRun.findUnique.mockResolvedValue(baseRow);

      const found = await repository.findById(RUN_ID);

      expect(found?.estimatedCost).toBeNull();
    });

    it("converts a Prisma.Decimal estimatedCost into a plain number", async () => {
      prismaMock.reviewRun.findUnique.mockResolvedValue({
        ...baseRow,
        estimatedCost: new Prisma.Decimal("0.0123"),
      });

      const found = await repository.findById(RUN_ID);

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
      expect(found?.id.value).toBe(RUN_ID);
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
      expect(result.total).toBe(1);
      expect(result.reviewRuns[0]?.id.value).toBe(RUN_ID);
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

  describe("findByIds", () => {
    it("returns every run matching the id list", async () => {
      prismaMock.reviewRun.findMany.mockResolvedValue([baseRow]);

      const found = await repository.findByIds([RUN_ID]);

      expect(prismaMock.reviewRun.findMany).toHaveBeenCalledWith({
        where: { id: { in: [RUN_ID] } },
      });
      expect(found[0]?.id.value).toBe(RUN_ID);
    });

    it("returns an empty array without querying when given no ids", async () => {
      const found = await repository.findByIds([]);

      expect(found).toEqual([]);
      expect(prismaMock.reviewRun.findMany).not.toHaveBeenCalled();
    });
  });

  describe("sumUsageByRepoIdAndDateRange", () => {
    it("sums tokens/cost within the date range, converting Decimal to a number", async () => {
      prismaMock.reviewRun.aggregate.mockResolvedValue({
        _sum: {
          totalInputTokens: 1000,
          totalOutputTokens: 200,
          totalReasoningTokens: 50,
          estimatedCost: new Prisma.Decimal("1.2345"),
        },
      } as never);
      const from = new Date("2026-01-01T00:00:00Z");
      const to = new Date("2026-02-01T00:00:00Z");

      const usage = await repository.sumUsageByRepoIdAndDateRange("repo-1", from, to);

      expect(prismaMock.reviewRun.aggregate).toHaveBeenCalledWith({
        where: { repoId: "repo-1", createdAt: { gte: from, lt: to } },
        _sum: {
          totalInputTokens: true,
          totalOutputTokens: true,
          totalReasoningTokens: true,
          estimatedCost: true,
        },
      });
      expect(usage).toEqual({
        inputTokens: 1000,
        outputTokens: 200,
        reasoningTokens: 50,
        estimatedCost: 1.2345,
      });
    });

    it("defaults every sum to 0 when there are no runs in range", async () => {
      prismaMock.reviewRun.aggregate.mockResolvedValue({
        _sum: {
          totalInputTokens: null,
          totalOutputTokens: null,
          totalReasoningTokens: null,
          estimatedCost: null,
        },
      } as never);

      const usage = await repository.sumUsageByRepoIdAndDateRange(
        "repo-1",
        new Date("2026-01-01T00:00:00Z"),
        new Date("2026-02-01T00:00:00Z"),
      );

      expect(usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        estimatedCost: 0,
      });
    });
  });
});
