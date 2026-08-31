import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { CommentReply } from "../domain/entities/comment-reply.entity";
import { CommentReplyRepository } from "../domain/repository/comment-reply.repository";

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
  estimatedCost: Prisma.Decimal | null;
  createdAt: Date;
  completedAt: Date | null;
};

function toDomain(row: CommentReplyRow): CommentReply {
  return CommentReply.fromPersistence({
    ...row,
    status: row.status as CommentReply["status"],
    category: row.category as CommentReply["category"],
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
}
