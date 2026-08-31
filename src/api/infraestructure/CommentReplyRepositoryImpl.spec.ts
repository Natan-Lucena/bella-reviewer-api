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
});
