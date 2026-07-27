import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { Comment } from "../domain/entities/comment.entity";
import { CommentRepository, FindCommentsFilter } from "../domain/repository/comment.repository";

export class CommentRepositoryImpl implements CommentRepository {
  async save(comment: Comment): Promise<void> {
    await prisma.comment.upsert({
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
        createdAt: comment.createdAt,
      },
      update: {
        status: comment.status,
        externalId: comment.externalId,
      },
    });
  }

  async findByReviewRunId(reviewRunId: string): Promise<Comment[]> {
    const rows = await prisma.comment.findMany({ where: { reviewRunId } });
    return rows.map((row) => Comment.fromPersistence(row));
  }

  async findByRepoId(
    repoId: string,
    filter?: FindCommentsFilter,
  ): Promise<{ comments: Comment[]; total: number }> {
    const where = {
      reviewRun: {
        repoId,
        ...(filter?.prNumber !== undefined ? { prNumber: filter.prNumber } : {}),
      },
      ...(filter?.category ? { category: filter.category } : {}),
      ...(filter?.severity ? { severity: filter.severity } : {}),
      ...(filter?.status ? { status: filter.status } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filter?.limit ?? 20,
        skip: filter?.offset ?? 0,
      }),
      prisma.comment.count({ where }),
    ]);
    return { comments: rows.map((row) => Comment.fromPersistence(row)), total };
  }
}
