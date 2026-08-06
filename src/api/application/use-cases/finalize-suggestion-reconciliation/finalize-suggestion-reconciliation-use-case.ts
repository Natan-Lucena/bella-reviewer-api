import { failure, Result, success } from "../../../../shared/core/result";
import { CommentApplyEvent } from "../../../domain/entities/comment-apply-event.entity";
import { CommentApplyEventRepository } from "../../../domain/repository/comment-apply-event.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";

export type FinalizeSuggestionReconciliationParams = {
  repoId: string;
  prNumber: number;
  finalCommitSha: string;
};

export type FinalizeSuggestionReconciliationError = "repo_not_found";

// Called when a PR closes (merged or not) — the last point at which a
// suggestion still "pending" can ever be reconciled, since there's no
// further push to compare against. No content check here on purpose: if the
// suggestion had been applied, a synchronize event already caught it
// (reconcile-suggestion-applications.ts); still pending at close time is
// itself the signal that it wasn't adopted.
export class FinalizeSuggestionReconciliationUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly commentRepository: CommentRepository,
    private readonly commentApplyEventRepository: CommentApplyEventRepository,
  ) {}

  async execute(
    params: FinalizeSuggestionReconciliationParams,
  ): Promise<Result<void, FinalizeSuggestionReconciliationError>> {
    const repo = await this.repoRepository.findById(params.repoId);
    if (!repo) {
      return failure("repo_not_found");
    }

    const pending = await this.commentRepository.findPendingSuggestionsByRepoIdAndPrNumber(
      params.repoId,
      params.prNumber,
    );

    for (const comment of pending) {
      const updated = comment.markApplyStatus("not_applied", {
        commitSha: params.finalCommitSha,
        detectionMethod: "pr_closed",
      });
      await this.commentRepository.save(updated);
      await this.commentApplyEventRepository.save(
        CommentApplyEvent.create({
          commentId: updated.id.value,
          newStatus: "not_applied",
          commitSha: params.finalCommitSha,
          detectionMethod: "pr_closed",
        }),
      );
    }

    return success(undefined);
  }
}
