import { failure, Result, success } from "../../../../shared/core/result";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";
import { Comment } from "../../../domain/entities/comment.entity";
import { ReviewTurn } from "../../../domain/entities/review-turn.entity";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReviewTurnRepository } from "../../../domain/repository/review-turn.repository";

export type GetReviewRunDetailParams = {
  userId: string;
  repoId: string;
  runId: string;
};

export type GetReviewRunDetailError = "repo_not_found" | "review_run_not_found";

export type GetReviewRunDetailResult = {
  id: string;
  prNumber: number;
  commitSha: string;
  status: string;
  errorReason: string | null;
  turns: ReturnType<ReviewTurn["toJSON"]>[];
  comments: ReturnType<Comment["toJSON"]>[];
};

export class GetReviewRunDetailUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly reviewRunRepository: ReviewRunRepository,
    private readonly reviewTurnRepository: ReviewTurnRepository,
    private readonly commentRepository: CommentRepository,
  ) {}

  async execute(
    params: GetReviewRunDetailParams,
  ): Promise<Result<GetReviewRunDetailResult, GetReviewRunDetailError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    const reviewRun = await this.reviewRunRepository.findById(params.runId);
    // A runId that belongs to a different repo is treated the same as one
    // that doesn't exist at all — never leaks another repo's execution data
    // just because the caller guessed a valid id.
    if (!reviewRun || reviewRun.repoId !== repo.id.value) {
      return failure("review_run_not_found");
    }

    const [turns, comments] = await Promise.all([
      this.reviewTurnRepository.findByReviewRunId(reviewRun.id.value),
      this.commentRepository.findByReviewRunId(reviewRun.id.value),
    ]);

    return success({
      id: reviewRun.id.value,
      prNumber: reviewRun.prNumber,
      commitSha: reviewRun.commitSha,
      status: reviewRun.status,
      errorReason: reviewRun.errorReason,
      turns: turns.map((turn) => turn.toJSON()),
      comments: comments.map((comment) => comment.toJSON()),
    });
  }
}
