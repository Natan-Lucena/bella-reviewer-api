import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import type { PrismaClient } from "../../../generated/prisma";

vi.mock("../../shared/infra/database/relational/prisma-client", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { Comment } from "../domain/entities/comment.entity";
import { CommentRepositoryImpl } from "./CommentRepositoryImpl";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

const row = {
  id: "comment-1",
  reviewRunId: "run-1",
  reviewTurnId: "turn-1",
  file: "src/index.ts",
  line: 10,
  category: "security",
  severity: "high" as const,
  body: "example comment",
  status: "published" as const,
  externalId: "gh-123",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("CommentRepositoryImpl", () => {
  const repository = new CommentRepositoryImpl();

  describe("save", () => {
    it("upserts by id, only updating status and externalId on conflict", async () => {
      const comment = Comment.create({
        reviewRunId: "run-1",
        reviewTurnId: "turn-1",
        file: "src/index.ts",
        line: 10,
        category: "security",
        severity: "high",
        body: "example comment",
      });

      await repository.save(comment);

      expect(prismaMock.comment.upsert).toHaveBeenCalledWith({
        where: { id: comment.id },
        create: {
          id: comment.id,
          reviewRunId: comment.reviewRunId,
          reviewTurnId: comment.reviewTurnId,
          file: comment.file,
          line: comment.line,
          category: comment.category,
          severity: comment.severity,
          body: comment.body,
          status: comment.status,
          externalId: comment.externalId,
          createdAt: comment.createdAt,
        },
        update: {
          status: comment.status,
          externalId: comment.externalId,
        },
      });
    });
  });

  describe("findByReviewRunId", () => {
    it("returns every comment belonging to the run", async () => {
      prismaMock.comment.findMany.mockResolvedValue([row]);

      const found = await repository.findByReviewRunId("run-1");

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({ where: { reviewRunId: "run-1" } });
      expect(found).toHaveLength(1);
      expect(found[0]?.id).toBe("comment-1");
    });
  });

  describe("findByRepoId", () => {
    it("scopes by repo via the ReviewRun relation and applies every filter", async () => {
      prismaMock.comment.findMany.mockResolvedValue([row]);
      prismaMock.comment.count.mockResolvedValue(1);

      const result = await repository.findByRepoId("repo-1", {
        prNumber: 42,
        category: "security",
        severity: "high",
        status: "published",
        limit: 10,
        offset: 0,
      });

      const expectedWhere = {
        reviewRun: { repoId: "repo-1", prNumber: 42 },
        category: "security",
        severity: "high",
        status: "published",
      };
      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: { createdAt: "desc" },
        take: 10,
        skip: 0,
      });
      expect(prismaMock.comment.count).toHaveBeenCalledWith({ where: expectedWhere });
      expect(result).toEqual({
        comments: [expect.objectContaining({ id: "comment-1" })],
        total: 1,
      });
    });

    it("scopes by repo alone when no other filter is provided", async () => {
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.comment.count.mockResolvedValue(0);

      await repository.findByRepoId("repo-1");

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        where: { reviewRun: { repoId: "repo-1" } },
        orderBy: { createdAt: "desc" },
        take: 20,
        skip: 0,
      });
    });
  });
});
