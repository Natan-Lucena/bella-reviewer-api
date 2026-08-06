import { config } from "../../../../config";
import { logger } from "../../../../logger";
import { Result, success } from "../../../../shared/core/result";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { Diff } from "../../../domain/ports/scm-adapter.port";
import { QueuePort } from "../../../domain/ports/queue.port";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReconcileSuggestionApplicationsUseCase } from "../reconcile-suggestion-applications/reconcile-suggestion-applications-use-case";

export type IngestActionParams = {
  repoId: string;
  prNumber: number;
  commitSha: string;
  diff: Diff;
  prTitle?: string;
  prDescription?: string;
  // Only sent by an Action new enough to support it, and only for a
  // synchronize-equivalent push — see
  // reconcile-suggestion-applications-use-case.ts.
  previousCommitSha?: string;
};

export type IngestActionResult = {
  reviewRun: ReviewRun;
  isNew: boolean;
};

export type IngestActionError = never;

export class IngestActionUseCase {
  constructor(
    private readonly reviewRunRepository: ReviewRunRepository,
    private readonly queue: QueuePort,
    private readonly reconcileSuggestionApplicationsUseCase: ReconcileSuggestionApplicationsUseCase,
  ) {}

  async execute(
    params: IngestActionParams,
  ): Promise<Result<IngestActionResult, IngestActionError>> {
    // Idempotency: a second call for a commit already ingested returns the
    // existing run as-is — no new row, no re-enqueue.
    const existing = await this.reviewRunRepository.findByRepoIdAndCommitSha(
      params.repoId,
      params.commitSha,
    );
    if (existing) {
      return success({ reviewRun: existing, isNew: false });
    }

    const reviewRun = ReviewRun.create({
      repoId: params.repoId,
      prNumber: params.prNumber,
      commitSha: params.commitSha,
      trigger: "action",
    });
    await this.reviewRunRepository.save(reviewRun);

    // Best-effort, never blocks this response — see
    // reconcilePendingSuggestions below. The Action only ever sends
    // previousCommitSha for a synchronize-equivalent push, so its mere
    // presence is already the right condition (unlike the webhook path,
    // there's no separate `action` field to also check here).
    if (params.previousCommitSha) {
      await this.reconcilePendingSuggestions(
        params.repoId,
        params.prNumber,
        params.previousCommitSha,
        params.commitSha,
      );
    }

    // The diff is never persisted (it may contain source code) — it only
    // ever travels in memory and in this queue message. prTitle/prDescription
    // aren't sensitive, but there's no need to persist them either, so they
    // follow the diff's lifecycle rather than getting a ReviewRun column.
    await this.queue.publish({
      url: `${config.BACKEND_PUBLIC_URL}/internal/review-runs/${reviewRun.id.value}/process`,
      body: { diff: params.diff, prTitle: params.prTitle, prDescription: params.prDescription },
      headers: { Authorization: `Bearer ${config.INTERNAL_PROCESS_API_KEY}` },
    });

    return success({ reviewRun, isNew: true });
  }

  // Same best-effort spirit as the welcome message in ProcessReviewRunUseCase
  // — covers both an expected business failure (Result.ok === false) and an
  // unexpected throw (a transient GitHub API error propagating out of
  // reconcileSuggestionApplications).
  private async reconcilePendingSuggestions(
    repoId: string,
    prNumber: number,
    previousCommitSha: string,
    newCommitSha: string,
  ): Promise<void> {
    try {
      const result = await this.reconcileSuggestionApplicationsUseCase.execute({
        repoId,
        prNumber,
        previousCommitSha,
        newCommitSha,
      });
      if (!result.ok) {
        logger.warn("Suggestion reconciliation failed", { reason: result.error });
      }
    } catch (error) {
      logger.warn("Suggestion reconciliation failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
