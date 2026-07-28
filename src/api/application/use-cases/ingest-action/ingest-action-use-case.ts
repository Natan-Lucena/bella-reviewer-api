import { config } from "../../../../config";
import { Result, success } from "../../../../shared/core/result";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { Diff } from "../../../domain/ports/scm-adapter.port";
import { QueuePort } from "../../../domain/ports/queue.port";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";

export type IngestActionParams = {
  repoId: string;
  prNumber: number;
  commitSha: string;
  diff: Diff;
  prTitle?: string;
  prDescription?: string;
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
}
