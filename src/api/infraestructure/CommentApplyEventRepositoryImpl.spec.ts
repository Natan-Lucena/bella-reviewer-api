import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import type { PrismaClient } from "../../../generated/prisma";

vi.mock("../../shared/infra/database/relational/prisma-client", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { CommentApplyEvent } from "../domain/entities/comment-apply-event.entity";
import { CommentApplyEventRepositoryImpl } from "./CommentApplyEventRepositoryImpl";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const EVENT_ID = "88888888-8888-8888-8888-888888888888";

beforeEach(() => {
  mockReset(prismaMock);
});

const row = {
  id: EVENT_ID,
  commentId: "comment-1",
  newStatus: "applied_manual" as const,
  commitSha: "abc123",
  detectionMethod: "content_match",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("CommentApplyEventRepositoryImpl", () => {
  const repository = new CommentApplyEventRepositoryImpl();

  describe("save", () => {
    it("creates the event — no upsert, since events never update", async () => {
      const event = CommentApplyEvent.create({
        commentId: "comment-1",
        newStatus: "applied_manual",
        commitSha: "abc123",
        detectionMethod: "content_match",
      });

      await repository.save(event);

      expect(prismaMock.commentApplyEvent.create).toHaveBeenCalledWith({
        data: {
          id: event.id.value,
          commentId: event.commentId,
          newStatus: event.newStatus,
          commitSha: event.commitSha,
          detectionMethod: event.detectionMethod,
          createdAt: event.createdAt,
        },
      });
      expect(prismaMock.commentApplyEvent.upsert).not.toHaveBeenCalled();
    });
  });

  describe("findByCommentId", () => {
    it("returns every event for the comment, oldest first", async () => {
      prismaMock.commentApplyEvent.findMany.mockResolvedValue([row]);

      const found = await repository.findByCommentId("comment-1");

      expect(prismaMock.commentApplyEvent.findMany).toHaveBeenCalledWith({
        where: { commentId: "comment-1" },
        orderBy: { createdAt: "asc" },
      });
      expect(found).toHaveLength(1);
      expect(found[0]?.id.value).toBe(EVENT_ID);
      expect(found[0]?.newStatus).toBe("applied_manual");
    });
  });
});
