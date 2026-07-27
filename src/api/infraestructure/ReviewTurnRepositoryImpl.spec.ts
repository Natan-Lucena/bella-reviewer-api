import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import type { PrismaClient } from "../../../generated/prisma";

vi.mock("../../shared/infra/database/relational/prisma-client", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { ReviewTurn } from "../domain/entities/review-turn.entity";
import { ReviewTurnRepositoryImpl } from "./ReviewTurnRepositoryImpl";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe("ReviewTurnRepositoryImpl", () => {
  const repository = new ReviewTurnRepositoryImpl();

  describe("save", () => {
    it("upserts by id, only updating errorReason on conflict", async () => {
      const turn = ReviewTurn.create({
        reviewRunId: "run-1",
        index: 1,
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 10,
      });

      await repository.save(turn);

      expect(prismaMock.reviewTurn.upsert).toHaveBeenCalledWith({
        where: { id: turn.id },
        create: {
          id: turn.id,
          reviewRunId: turn.reviewRunId,
          index: turn.index,
          inputTokens: turn.inputTokens,
          outputTokens: turn.outputTokens,
          reasoningTokens: turn.reasoningTokens,
          source: turn.source,
          errorReason: turn.errorReason,
          createdAt: turn.createdAt,
        },
        update: {
          errorReason: turn.errorReason,
        },
      });
    });
  });

  describe("findByReviewRunId", () => {
    it("returns turns ordered by index", async () => {
      const rows = [
        {
          id: "turn-1",
          reviewRunId: "run-1",
          index: 1,
          inputTokens: 100,
          outputTokens: 50,
          reasoningTokens: 10,
          source: "agent" as const,
          errorReason: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ];
      prismaMock.reviewTurn.findMany.mockResolvedValue(rows);

      const found = await repository.findByReviewRunId("run-1");

      expect(prismaMock.reviewTurn.findMany).toHaveBeenCalledWith({
        where: { reviewRunId: "run-1" },
        orderBy: { index: "asc" },
      });
      expect(found).toHaveLength(1);
      expect(found[0]?.index).toBe(1);
    });

    it("returns an empty array when the run has no turns", async () => {
      prismaMock.reviewTurn.findMany.mockResolvedValue([]);

      expect(await repository.findByReviewRunId("run-without-turns")).toEqual([]);
    });
  });
});
