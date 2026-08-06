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

const COMMENT_ID = "55555555-5555-5555-5555-555555555555";

beforeEach(() => {
  mockReset(prismaMock);
});

const row = {
  id: COMMENT_ID,
  reviewRunId: "run-1",
  reviewTurnId: "turn-1",
  file: "src/index.ts",
  line: 10,
  category: "security",
  severity: "high" as const,
  body: "example comment",
  status: "published" as const,
  externalId: "gh-123",
  kind: "observation" as const,
  suggestedCode: null,
  applyStatus: null,
  appliedAt: null,
  appliedAtCommit: null,
  detectionMethod: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("CommentRepositoryImpl", () => {
  const repository = new CommentRepositoryImpl();

  describe("save", () => {
    it("upserts by id, sending every mutable field on conflict", async () => {
      const comment = Comment.create({
        reviewRunId: "run-1",
        reviewTurnId: "turn-1",
        file: "src/index.ts",
        line: 10,
        category: "security",
        severity: "high",
        body: "example comment",
        kind: "actionable",
        suggestedCode: "const x = 1;",
      }).markApplyStatus("applied_manual", {
        commitSha: "abc123",
        detectionMethod: "content_match",
      });

      await repository.save(comment);

      expect(prismaMock.comment.upsert).toHaveBeenCalledWith({
        where: { id: comment.id.value },
        create: {
          id: comment.id.value,
          reviewRunId: comment.reviewRunId,
          reviewTurnId: comment.reviewTurnId,
          file: comment.file,
          line: comment.line,
          category: comment.category,
          severity: comment.severity,
          body: comment.body,
          status: comment.status,
          externalId: comment.externalId,
          kind: comment.kind,
          suggestedCode: comment.suggestedCode,
          applyStatus: comment.applyStatus,
          appliedAt: comment.appliedAt,
          appliedAtCommit: comment.appliedAtCommit,
          detectionMethod: comment.detectionMethod,
          createdAt: comment.createdAt,
        },
        update: {
          status: comment.status,
          externalId: comment.externalId,
          applyStatus: comment.applyStatus,
          appliedAt: comment.appliedAt,
          appliedAtCommit: comment.appliedAtCommit,
          detectionMethod: comment.detectionMethod,
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
      expect(found[0]?.id.value).toBe(COMMENT_ID);
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
      expect(result.total).toBe(1);
      expect(result.comments[0]?.id.value).toBe(COMMENT_ID);
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

  describe("countPublishedByReviewRunIds", () => {
    it("returns one published count per reviewRunId via a single grouped query", async () => {
      prismaMock.comment.groupBy.mockResolvedValue([
        { reviewRunId: "run-1", _count: { _all: 3 } },
        { reviewRunId: "run-2", _count: { _all: 1 } },
      ] as never);

      const counts = await repository.countPublishedByReviewRunIds(["run-1", "run-2"]);

      expect(prismaMock.comment.groupBy).toHaveBeenCalledWith({
        by: ["reviewRunId"],
        where: { reviewRunId: { in: ["run-1", "run-2"] }, status: "published" },
        _count: { _all: true },
      });
      expect(counts).toEqual({ "run-1": 3, "run-2": 1 });
    });

    it("returns an empty object without querying when given no ids", async () => {
      const counts = await repository.countPublishedByReviewRunIds([]);

      expect(counts).toEqual({});
      expect(prismaMock.comment.groupBy).not.toHaveBeenCalled();
    });
  });

  describe("findPendingSuggestionsByRepoIdAndPrNumber", () => {
    it("queries by kind=actionable, applyStatus=pending, externalId not null, scoped via the ReviewRun relation", async () => {
      const pendingRow = {
        ...row,
        kind: "actionable" as const,
        suggestedCode: "const x = 1;",
        applyStatus: "pending" as const,
        externalId: "gh-123",
      };
      prismaMock.comment.findMany.mockResolvedValue([pendingRow]);

      const found = await repository.findPendingSuggestionsByRepoIdAndPrNumber("repo-1", 42);

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        where: {
          kind: "actionable",
          applyStatus: "pending",
          externalId: { not: null },
          reviewRun: { repoId: "repo-1", prNumber: 42 },
        },
      });
      expect(found).toHaveLength(1);
      expect(found[0]?.kind).toBe("actionable");
    });

    it("maps every matching row regardless of which ReviewRun it came from — the query itself, not this method, scopes by PR", async () => {
      const suggestionFromEarlierRun = {
        ...row,
        id: "66666666-6666-6666-6666-666666666666",
        reviewRunId: "run-1",
        kind: "actionable" as const,
        applyStatus: "pending" as const,
        externalId: "gh-1",
      };
      const suggestionFromLaterRun = {
        ...row,
        id: "77777777-7777-7777-7777-777777777777",
        reviewRunId: "run-2",
        kind: "actionable" as const,
        applyStatus: "pending" as const,
        externalId: "gh-2",
      };
      prismaMock.comment.findMany.mockResolvedValue([
        suggestionFromEarlierRun,
        suggestionFromLaterRun,
      ]);

      const found = await repository.findPendingSuggestionsByRepoIdAndPrNumber("repo-1", 42);

      expect(found.map((c) => c.reviewRunId)).toEqual(["run-1", "run-2"]);
    });
  });
});
