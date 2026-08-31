import { LlmProvider, Prisma } from "../../../generated/prisma";
import { prisma } from "../../shared/infra/database/relational/prisma-client";
import { ReviewRun } from "../domain/entities/review-run.entity";
import {
  CostByModelEntry,
  FindReviewRunsFilter,
  ReviewRunRepository,
  UsageSum,
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
  llmProvider: LlmProvider | null;
  model: string | null;
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
    llmProvider: row.llmProvider as ReviewRun["llmProvider"],
    estimatedCost: row.estimatedCost ? row.estimatedCost.toNumber() : null,
  });
}

export class ReviewRunRepositoryImpl implements ReviewRunRepository {
  async save(reviewRun: ReviewRun): Promise<void> {
    await prisma.reviewRun.upsert({
      where: { id: reviewRun.id.value },
      create: {
        id: reviewRun.id.value,
        repoId: reviewRun.repoId,
        prNumber: reviewRun.prNumber,
        commitSha: reviewRun.commitSha,
        trigger: reviewRun.trigger,
        status: reviewRun.status,
        errorReason: reviewRun.errorReason,
        totalInputTokens: reviewRun.totalInputTokens,
        totalOutputTokens: reviewRun.totalOutputTokens,
        totalReasoningTokens: reviewRun.totalReasoningTokens,
        llmProvider: reviewRun.llmProvider,
        model: reviewRun.model,
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
        llmProvider: reviewRun.llmProvider,
        model: reviewRun.model,
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

  async findByIds(ids: string[]): Promise<ReviewRun[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await prisma.reviewRun.findMany({ where: { id: { in: ids } } });
    return rows.map(toDomain);
  }

  async sumUsageByRepoIdAndDateRange(repoId: string, from: Date, to: Date): Promise<UsageSum> {
    const result = await prisma.reviewRun.aggregate({
      where: { repoId, createdAt: { gte: from, lt: to } },
      _sum: {
        totalInputTokens: true,
        totalOutputTokens: true,
        totalReasoningTokens: true,
        estimatedCost: true,
      },
    });

    return {
      inputTokens: result._sum.totalInputTokens ?? 0,
      outputTokens: result._sum.totalOutputTokens ?? 0,
      reasoningTokens: result._sum.totalReasoningTokens ?? 0,
      estimatedCost: result._sum.estimatedCost ? result._sum.estimatedCost.toNumber() : 0,
    };
  }

  async getCostByModelSum(
    repoId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<CostByModelEntry[]> {
    const groups = await prisma.reviewRun.groupBy({
      by: ["llmProvider", "model"],
      where: {
        repoId,
        llmProvider: { not: null },
        createdAt: { gte: dateRange.from, lt: dateRange.to },
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
