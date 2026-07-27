import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { ReviewTurn } from "../domain/entities/review-turn.entity";
import { ReviewTurnRepository } from "../domain/repository/review-turn.repository";

export class ReviewTurnRepositoryImpl implements ReviewTurnRepository {
  async save(turn: ReviewTurn): Promise<void> {
    await prisma.reviewTurn.upsert({
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
  }

  async findByReviewRunId(reviewRunId: string): Promise<ReviewTurn[]> {
    const rows = await prisma.reviewTurn.findMany({
      where: { reviewRunId },
      orderBy: { index: "asc" },
    });
    return rows.map((row) => ReviewTurn.fromPersistence(row));
  }
}
