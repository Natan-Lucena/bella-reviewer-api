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

  async countPublishedByReviewRunIds(reviewRunIds: string[]): Promise<Record<string, number>> {
    if (reviewRunIds.length === 0) {
      return {};
    }

    const groups = await prisma.comment.groupBy({
      by: ["reviewRunId"],
      where: { reviewRunId: { in: reviewRunIds }, status: "published" },
      _count: { _all: true },
    });

    return Object.fromEntries(groups.map((group) => [group.reviewRunId, group._count._all]));
  }

  async findPendingSuggestionsByRepoIdAndPrNumber(
    repoId: string,
    prNumber: number,
  ): Promise<Comment[]> {
    const rows = await prisma.comment.findMany({
      where: {
        kind: "actionable",
        applyStatus: "pending",
        externalId: { not: null },
        reviewRun: { repoId, prNumber },
      },
    });
    return rows.map((row) => Comment.fromPersistence(row));
  }

  async findByExternalId(externalId: string): Promise<Comment | null> {
    const row = await prisma.comment.findFirst({ where: { externalId } });
    return row ? Comment.fromPersistence(row) : null;
  }
}
