import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { ApplyStatus, Comment, Severity } from "../domain/entities/comment.entity";
import {
  AcceptanceStats,
  CommentRepository,
  FindCommentsFilter,
} from "../domain/repository/comment.repository";

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
        endLine: comment.endLine,
        category: comment.category,
        severity: comment.severity,
        body: comment.body,
        status: comment.status,
        externalId: comment.externalId,
        kind: comment.kind,
        suggestedCode: comment.suggestedCode,
        contextBefore: comment.contextBefore,
        contextAfter: comment.contextAfter,
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

  async findById(id: string): Promise<Comment | null> {
    const row = await prisma.comment.findUnique({ where: { id } });
    return row ? Comment.fromPersistence(row) : null;
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

  async getAcceptanceStats(
    repoId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<AcceptanceStats> {
    const actionableWhere = {
      kind: "actionable" as const,
      reviewRun: { repoId },
      createdAt: { gte: dateRange.from, lt: dateRange.to },
    };

    const [byCategoryGroups, bySeverityGroups, actionableCount, observationCount] =
      await Promise.all([
        prisma.comment.groupBy({
          by: ["category", "applyStatus"],
          where: actionableWhere,
          _count: { _all: true },
        }),
        prisma.comment.groupBy({
          by: ["severity", "applyStatus"],
          where: actionableWhere,
          _count: { _all: true },
        }),
        prisma.comment.count({ where: actionableWhere }),
        prisma.comment.count({
          where: {
            kind: "observation",
            reviewRun: { repoId },
            createdAt: { gte: dateRange.from, lt: dateRange.to },
          },
        }),
      ]);

    return {
      byCategory: byCategoryGroups.map((group) => ({
        category: group.category,
        // Never null here — the where clause restricts to kind = "actionable",
        // and applyStatus is only ever null for kind = "observation".
        applyStatus: group.applyStatus as ApplyStatus,
        count: group._count._all,
      })),
      bySeverity: bySeverityGroups.map((group) => ({
        severity: group.severity as Severity,
        applyStatus: group.applyStatus as ApplyStatus,
        count: group._count._all,
      })),
      actionableCount,
      observationCount,
    };
  }
}
