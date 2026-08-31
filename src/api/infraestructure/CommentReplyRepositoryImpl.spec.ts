import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import type { PrismaClient } from "../../../generated/prisma";

vi.mock("../../shared/infra/database/relational/prisma-client", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { CommentReply } from "../domain/entities/comment-reply.entity";
import { CommentReplyRepositoryImpl } from "./CommentReplyRepositoryImpl";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const REPLY_ID = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  mockReset(prismaMock);
});

const baseRow = {
  id: REPLY_ID,
  commentId: "comment-1",
  humanExternalId: "gh-comment-1",
  humanBody: "Why not use a Map here instead?",
  humanAuthor: "octocat",
  status: "completed" as const,
  category: "clarification" as const,
  errorReason: null,
  bellaBody: "Because we need insertion order guarantees here.",
  bellaSuggestedCode: null,
  bellaExternalId: "gh-comment-2",
  inputTokens: 120,
  outputTokens: 45,
  reasoningTokens: 10,
  estimatedCost: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  completedAt: new Date("2026-01-01T00:05:00Z"),
};

describe("CommentReplyRepositoryImpl", () => {
  const repository = new CommentReplyRepositoryImpl();

  describe("save", () => {
    it("upserts by id with the entity's fields", async () => {
      const reply = CommentReply.create({
        commentId: "comment-1",
        humanExternalId: "gh-comment-1",
        humanBody: "Why not use a Map here instead?",
        humanAuthor: "octocat",
      });

      await repository.save(reply);

      expect(prismaMock.commentReply.upsert).toHaveBeenCalledWith({
        where: { id: reply.id.value },
        create: expect.objectContaining({ id: reply.id.value, status: "queued" }),
        update: expect.objectContaining({ status: "queued" }),
      });
    });
  });

  describe("findById", () => {
    it("maps a null estimatedCost to null", async () => {
      prismaMock.commentReply.findUnique.mockResolvedValue(baseRow);

      const found = await repository.findById(REPLY_ID);

      expect(found?.estimatedCost).toBeNull();
    });

    it("converts a Prisma.Decimal estimatedCost into a plain number", async () => {
      prismaMock.commentReply.findUnique.mockResolvedValue({
        ...baseRow,
        estimatedCost: new Prisma.Decimal("0.0042"),
      });

      const found = await repository.findById(REPLY_ID);

      expect(found?.estimatedCost).toBe(0.0042);
    });

    it("returns null when no reply is found", async () => {
      prismaMock.commentReply.findUnique.mockResolvedValue(null);

      expect(await repository.findById("missing")).toBeNull();
    });
  });

  describe("findByHumanExternalId", () => {
    it("looks up via the humanExternalId unique key", async () => {
      prismaMock.commentReply.findUnique.mockResolvedValue(baseRow);

      const found = await repository.findByHumanExternalId("gh-comment-1");

      expect(prismaMock.commentReply.findUnique).toHaveBeenCalledWith({
        where: { humanExternalId: "gh-comment-1" },
      });
      expect(found?.id.value).toBe(REPLY_ID);
    });

    it("returns null when no reply matches that human comment id yet", async () => {
      prismaMock.commentReply.findUnique.mockResolvedValue(null);

      expect(await repository.findByHumanExternalId("unknown")).toBeNull();
    });
  });

  describe("findByBellaExternalId", () => {
    it("uses findFirst, not findUnique — bellaExternalId is not a unique column", async () => {
      prismaMock.commentReply.findFirst.mockResolvedValue(baseRow);

      const found = await repository.findByBellaExternalId("gh-reply-1");

      expect(prismaMock.commentReply.findFirst).toHaveBeenCalledWith({
        where: { bellaExternalId: "gh-reply-1" },
      });
      expect(found?.id.value).toBe(REPLY_ID);
    });

    it("returns null when no reply's bellaExternalId matches", async () => {
      prismaMock.commentReply.findFirst.mockResolvedValue(null);

      expect(await repository.findByBellaExternalId("unknown")).toBeNull();
    });
  });

  describe("findByCommentId", () => {
    it("orders results by createdAt ascending", async () => {
      prismaMock.commentReply.findMany.mockResolvedValue([baseRow]);

      const found = await repository.findByCommentId("comment-1");

      expect(prismaMock.commentReply.findMany).toHaveBeenCalledWith({
        where: { commentId: "comment-1" },
        orderBy: { createdAt: "asc" },
      });
      expect(found[0]?.id.value).toBe(REPLY_ID);
    });
  });

  describe("countByCommentId", () => {
    it("returns the count for the given comment", async () => {
      prismaMock.commentReply.count.mockResolvedValue(3);

      const count = await repository.countByCommentId("comment-1");

      expect(prismaMock.commentReply.count).toHaveBeenCalledWith({
        where: { commentId: "comment-1" },
      });
      expect(count).toBe(3);
    });
  });

  describe("getCostByCategorySum", () => {
    const dateRange = { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-02-01T00:00:00Z") };

    it("groups by category with correctly summed costs and counts", async () => {
      prismaMock.commentReply.groupBy.mockResolvedValue([
        {
          category: "fix",
          _sum: { estimatedCost: new Prisma.Decimal("0.0150") },
          _count: { _all: 3 },
        },
        {
          category: "clarification",
          _sum: { estimatedCost: new Prisma.Decimal("0.0042") },
          _count: { _all: 1 },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);

      const result = await repository.getCostByCategorySum("repo-1", dateRange);

      expect(result).toEqual([
        { category: "fix", totalCost: 0.015, count: 3 },
        { category: "clarification", totalCost: 0.0042, count: 1 },
      ]);
    });

    it("excludes a null-category group entirely, not just its sum", async () => {
      prismaMock.commentReply.groupBy.mockResolvedValue([
        {
          category: "fix",
          _sum: { estimatedCost: new Prisma.Decimal("0.0150") },
          _count: { _all: 3 },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);

      const result = await repository.getCostByCategorySum("repo-1", dateRange);

      expect(result).toHaveLength(1);
      expect(result.find((r) => r.category === null)).toBeUndefined();
      expect(prismaMock.commentReply.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: { not: null } }),
        }),
      );
    });

    it("treats a null estimatedCost sum as 0", async () => {
      prismaMock.commentReply.groupBy.mockResolvedValue([
        {
          category: "fix",
          _sum: { estimatedCost: null },
          _count: { _all: 2 },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);

      const result = await repository.getCostByCategorySum("repo-1", dateRange);

      expect(result).toEqual([{ category: "fix", totalCost: 0, count: 2 }]);
    });

    it("applies the date range and repoId (via Comment -> ReviewRun) filters", async () => {
      prismaMock.commentReply.groupBy.mockResolvedValue([]);

      await repository.getCostByCategorySum("repo-1", dateRange);

      expect(prismaMock.commentReply.groupBy).toHaveBeenCalledWith({
        by: ["category"],
        where: {
          category: { not: null },
          createdAt: { gte: dateRange.from, lt: dateRange.to },
          comment: { reviewRun: { repoId: "repo-1" } },
        },
        _sum: { estimatedCost: true },
        _count: { _all: true },
      });
    });

    it("returns an empty array when there are no matching rows", async () => {
      prismaMock.commentReply.groupBy.mockResolvedValue([]);

      const result = await repository.getCostByCategorySum("repo-1", dateRange);

      expect(result).toEqual([]);
    });
  });
});
