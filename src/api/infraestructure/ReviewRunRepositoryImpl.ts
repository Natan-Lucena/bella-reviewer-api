import { Prisma } from "../../../generated/prisma";
import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { ReviewRun } from "../domain/entities/review-run.entity";
import {
  FindReviewRunsFilter,
  ReviewRunRepository,
} from "../domain/repository/review-run.repository";

type ReviewRunRow = {
  id: string;
  repoId: string;
  prNumber: number;
  commitSha: string;
  trigger: string;
  status: string;
  errorReason: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  estimatedCost: Prisma.Decimal | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

function toDomain(row: ReviewRunRow): ReviewRun {
  return ReviewRun.fromPersistence({
    ...row,
    trigger: row.trigger as ReviewRun["trigger"],
    status: row.status as ReviewRun["status"],
    estimatedCost: row.estimatedCost ? row.estimatedCost.toNumber() : null,
  });
}

export class ReviewRunRepositoryImpl implements ReviewRunRepository {
  async save(reviewRun: ReviewRun): Promise<void> {
    await prisma.reviewRun.upsert({
      where: { id: reviewRun.id },
      create: {
        id: reviewRun.id,
        repoId: reviewRun.repoId,
        prNumber: reviewRun.prNumber,
        commitSha: reviewRun.commitSha,
        trigger: reviewRun.trigger,
        status: reviewRun.status,
        errorReason: reviewRun.errorReason,
        totalInputTokens: reviewRun.totalInputTokens,
        totalOutputTokens: reviewRun.totalOutputTokens,
        totalReasoningTokens: reviewRun.totalReasoningTokens,
        estimatedCost: reviewRun.estimatedCost,
        startedAt: reviewRun.startedAt,
        completedAt: reviewRun.completedAt,
        createdAt: reviewRun.createdAt,
      },
      update: {
        status: reviewRun.status,
        errorReason: reviewRun.errorReason,
        totalInputTokens: reviewRun.totalInputTokens,
        totalOutputTokens: reviewRun.totalOutputTokens,
        totalReasoningTokens: reviewRun.totalReasoningTokens,
        estimatedCost: reviewRun.estimatedCost,
        startedAt: reviewRun.startedAt,
        completedAt: reviewRun.completedAt,
      },
    });
  }

  async findById(id: string): Promise<ReviewRun | null> {
    const row = await prisma.reviewRun.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByRepoIdAndCommitSha(repoId: string, commitSha: string): Promise<ReviewRun | null> {
    const row = await prisma.reviewRun.findUnique({
      where: { repoId_commitSha: { repoId, commitSha } },
    });
    return row ? toDomain(row) : null;
  }

  async findByRepoId(
    repoId: string,
    filter?: FindReviewRunsFilter,
  ): Promise<{ reviewRuns: ReviewRun[]; total: number }> {
    const where = { repoId, ...(filter?.status ? { status: filter.status } : {}) };
    const [rows, total] = await Promise.all([
      prisma.reviewRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filter?.limit ?? 20,
        skip: filter?.offset ?? 0,
      }),
      prisma.reviewRun.count({ where }),
    ]);
    return { reviewRuns: rows.map(toDomain), total };
  }
}
