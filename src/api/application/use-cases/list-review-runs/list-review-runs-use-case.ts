import { failure, Result, success } from "../../../../shared/core/result";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";
import { ReviewRunStatus } from "../../../domain/entities/review-run.entity";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";

export type ListReviewRunsParams = {
  userId: string;
  repoId: string;
  status?: ReviewRunStatus;
  limit?: number;
  offset?: number;
};

export type ListReviewRunsError = "repo_not_found";

export type ListReviewRunsResultItem = {
  id: string;
  prNumber: number;
  commitSha: string;
  trigger: string;
  status: string;
  errorReason: string | null;
  durationMs: number | null;
  commentCount: number;
  totalTokens: number;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type ListReviewRunsResult = {
  reviewRuns: ListReviewRunsResultItem[];
  total: number;
};

export class ListReviewRunsUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly reviewRunRepository: ReviewRunRepository,
    private readonly commentRepository: CommentRepository,
  ) {}

  async execute(
    params: ListReviewRunsParams,
  ): Promise<Result<ListReviewRunsResult, ListReviewRunsError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    const { reviewRuns, total } = await this.reviewRunRepository.findByRepoId(params.repoId, {
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    });

    const commentCounts = await this.commentRepository.countPublishedByReviewRunIds(
      reviewRuns.map((run) => run.id.value),
    );

    const items = reviewRuns.map((run) => ({
      id: run.id.value,
      prNumber: run.prNumber,
      commitSha: run.commitSha,
      trigger: run.trigger,
      status: run.status,
      errorReason: run.errorReason,
      durationMs:
        run.startedAt && run.completedAt
          ? run.completedAt.getTime() - run.startedAt.getTime()
          : null,
      commentCount: commentCounts[run.id.value] ?? 0,
      totalTokens: run.totalInputTokens + run.totalOutputTokens + run.totalReasoningTokens,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    }));

    return success({ reviewRuns: items, total });
  }
}
