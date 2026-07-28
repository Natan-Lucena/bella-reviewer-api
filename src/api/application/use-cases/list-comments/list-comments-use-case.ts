import { failure, Result, success } from "../../../../shared/core/result";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";
import { CommentStatus, Severity } from "../../../domain/entities/comment.entity";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";

export type ListCommentsParams = {
  userId: string;
  repoId: string;
  prNumber?: number;
  category?: string;
  severity?: Severity;
  status?: CommentStatus;
  limit?: number;
  offset?: number;
};

export type ListCommentsError = "repo_not_found";

export type ListCommentsResultItem = {
  id: string;
  reviewRunId: string;
  prNumber: number | null;
  file: string;
  line: number;
  category: string;
  severity: Severity;
  body: string;
  status: CommentStatus;
  createdAt: Date;
};

export type ListCommentsResult = {
  comments: ListCommentsResultItem[];
  total: number;
};

export class ListCommentsUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly commentRepository: CommentRepository,
    private readonly reviewRunRepository: ReviewRunRepository,
  ) {}

  async execute(
    params: ListCommentsParams,
  ): Promise<Result<ListCommentsResult, ListCommentsError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    const { comments, total } = await this.commentRepository.findByRepoId(params.repoId, {
      prNumber: params.prNumber,
      category: params.category,
      severity: params.severity,
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    });

    // Comment doesn't carry prNumber itself (that's a ReviewRun field) — one
    // batched lookup for the whole page instead of one per comment.
    const reviewRunIds = [...new Set(comments.map((comment) => comment.reviewRunId))];
    const reviewRuns = await this.reviewRunRepository.findByIds(reviewRunIds);
    const prNumberByReviewRunId = new Map(reviewRuns.map((run) => [run.id.value, run.prNumber]));

    const items = comments.map((comment) => ({
      id: comment.id.value,
      reviewRunId: comment.reviewRunId,
      prNumber: prNumberByReviewRunId.get(comment.reviewRunId) ?? null,
      file: comment.file,
      line: comment.line,
      category: comment.category,
      severity: comment.severity,
      body: comment.body,
      status: comment.status,
      createdAt: comment.createdAt,
    }));

    return success({ comments: items, total });
  }
}
