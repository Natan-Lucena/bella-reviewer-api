import { LlmProvider, Prisma } from "../../../generated/prisma";
import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { CommentReply } from "../domain/entities/comment-reply.entity";
import { CommentReplyRepository } from "../domain/repository/comment-reply.repository";
import { CostByModelEntry } from "../domain/repository/review-run.repository";

type CommentReplyRow = {
  id: string;
  commentId: string;
  humanExternalId: string;
  humanBody: string;
  humanAuthor: string;
  status: string;
  category: string | null;
  errorReason: string | null;
  bellaBody: string | null;
  bellaSuggestedCode: string | null;
  bellaExternalId: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  llmProvider: LlmProvider | null;
  model: string | null;
  estimatedCost: Prisma.Decimal | null;
  createdAt: Date;
  completedAt: Date | null;
};

function toDomain(row: CommentReplyRow): CommentReply {
  return CommentReply.fromPersistence({
    ...row,
    status: row.status as CommentReply["status"],
    category: row.category as CommentReply["category"],
    llmProvider: row.llmProvider as CommentReply["llmProvider"],
    estimatedCost: row.estimatedCost ? row.estimatedCost.toNumber() : null,
  });
}

export class CommentReplyRepositoryImpl implements CommentReplyRepository {
  async save(reply: CommentReply): Promise<void> {
    await prisma.commentReply.upsert({
      where: { id: reply.id.value },
      create: {
        id: reply.id.value,
        commentId: reply.commentId,
        humanExternalId: reply.humanExternalId,
        humanBody: reply.humanBody,
        humanAuthor: reply.humanAuthor,
        status: reply.status,
        category: reply.category,
        errorReason: reply.errorReason,
        bellaBody: reply.bellaBody,
        bellaSuggestedCode: reply.bellaSuggestedCode,
        bellaExternalId: reply.bellaExternalId,
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
        reasoningTokens: reply.reasoningTokens,
        llmProvider: reply.llmProvider,
        model: reply.model,
        estimatedCost: reply.estimatedCost,
        createdAt: reply.createdAt,
        completedAt: reply.completedAt,
      },
      update: {
        status: reply.status,
        category: reply.category,
        errorReason: reply.errorReason,
        bellaBody: reply.bellaBody,
        bellaSuggestedCode: reply.bellaSuggestedCode,
        bellaExternalId: reply.bellaExternalId,
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
        reasoningTokens: reply.reasoningTokens,
        llmProvider: reply.llmProvider,
        model: reply.model,
        estimatedCost: reply.estimatedCost,
        completedAt: reply.completedAt,
      },
    });
  }

  async findById(id: string): Promise<CommentReply | null> {
    const row = await prisma.commentReply.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByHumanExternalId(humanExternalId: string): Promise<CommentReply | null> {
    const row = await prisma.commentReply.findUnique({ where: { humanExternalId } });
    return row ? toDomain(row) : null;
  }

  async findByBellaExternalId(bellaExternalId: string): Promise<CommentReply | null> {
    // Not @unique in the schema (unlike humanExternalId) — bellaExternalId
    // is only ever set once, by the row's own processing, but nothing
    // enforces uniqueness at the DB level the way idempotency requires for
    // humanExternalId. findFirst is correct here, not findUnique.
    const row = await prisma.commentReply.findFirst({ where: { bellaExternalId } });
    return row ? toDomain(row) : null;
  }

  async findByCommentId(commentId: string): Promise<CommentReply[]> {
    const rows = await prisma.commentReply.findMany({
      where: { commentId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDomain);
  }

  async countByCommentId(commentId: string): Promise<number> {
    return prisma.commentReply.count({ where: { commentId } });
  }

  async getCostByCategorySum(
    repoId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<Array<{ category: string; totalCost: number; count: number }>> {
    const groups = await prisma.commentReply.groupBy({
      by: ["category"],
      where: {
        category: { not: null },
        createdAt: { gte: dateRange.from, lt: dateRange.to },
        comment: { reviewRun: { repoId } },
      },
      _sum: { estimatedCost: true },
      _count: { _all: true },
    });

    return groups.map((group) => ({
      // Never null here — the where clause restricts to category: { not: null }.
      category: group.category as string,
      totalCost: group._sum.estimatedCost ? group._sum.estimatedCost.toNumber() : 0,
      count: group._count._all,
    }));
  }

  async getCostByModelSum(
    repoId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<CostByModelEntry[]> {
    const groups = await prisma.commentReply.groupBy({
      by: ["llmProvider", "model"],
      where: {
        llmProvider: { not: null },
        createdAt: { gte: dateRange.from, lt: dateRange.to },
        comment: { reviewRun: { repoId } },
      },
      _sum: { estimatedCost: true },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });

    return groups.map((group) => ({
      // Never null here — the where clause restricts to llmProvider: { not: null }.
      provider: group.llmProvider as string,
      // Never null here — grouped by model, and rows with llmProvider set
      // always have model set alongside it.
      model: group.model as string,
      totalCost: group._sum.estimatedCost ? group._sum.estimatedCost.toNumber() : 0,
      count: group._count._all,
      // Never null here — every group has at least one row by definition, and
      // createdAt is a non-nullable column, so MIN/MAX always resolves.
      firstUsedAt: group._min.createdAt as Date,
      lastUsedAt: group._max.createdAt as Date,
    }));
  }
}
