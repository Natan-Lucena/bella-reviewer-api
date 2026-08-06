import { config } from "../../../../config";
import { logger } from "../../../../logger";
import { Result, success } from "../../../../shared/core/result";
import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { QueuePort } from "../../../domain/ports/queue.port";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { GithubScmAdapter } from "../../../integration/github/github-scm-adapter";
import { ReconcileSuggestionApplicationsUseCase } from "../reconcile-suggestion-applications/reconcile-suggestion-applications-use-case";

// New PR, new commit, or a reopened PR — anything else (closed, labeled,
// assigned, ...) is acknowledged but never turned into a ReviewRun.
const RELEVANT_ACTIONS = new Set(["opened", "synchronize", "reopened"]);

export type IngestWebhookParams = {
  repoId: string;
  action: string;
  prNumber: number;
  commitSha: string;
  prTitle: string;
  prDescription?: string;
  // Only present on a real GitHub payload when action = "synchronize" — see
  // reconcile-suggestion-applications-use-case.ts.
  previousCommitSha?: string;
};

export type IngestWebhookResult =
  { kind: "ignored" } | { kind: "accepted"; reviewRun: ReviewRun; isNew: boolean };

export type IngestWebhookError = never;

export class IngestWebhookUseCase {
  constructor(
    private readonly reviewRunRepository: ReviewRunRepository,
    private readonly repoRepository: RepoRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly queue: QueuePort,
    private readonly reconcileSuggestionApplicationsUseCase: ReconcileSuggestionApplicationsUseCase,
  ) {}

  async execute(
    params: IngestWebhookParams,
  ): Promise<Result<IngestWebhookResult, IngestWebhookError>> {
    if (!RELEVANT_ACTIONS.has(params.action)) {
      return success({ kind: "ignored" });
    }

    const existing = await this.reviewRunRepository.findByRepoIdAndCommitSha(
      params.repoId,
      params.commitSha,
    );
    if (existing) {
      return success({ kind: "accepted", reviewRun: existing, isNew: false });
    }

    // The repo is guaranteed to exist here — the signature middleware
    // already resolved and validated it before this use case ever runs.
    const repo = await this.repoRepository.findById(params.repoId);
    if (!repo) {
      throw new Error(
        "Repo not found for a webhook event that already passed signature validation",
      );
    }

    const scmCredential = await this.credentialRepository.findByRepoIdAndType(params.repoId, "scm");
    if (!scmCredential?.encryptedSecret) {
      throw new Error("SCM credential not found for a repo with a configured webhook");
    }

    const scmAdapter = new GithubScmAdapter(decrypt(scmCredential.encryptedSecret));

    // Fetching the diff before creating the ReviewRun is deliberate: if this
    // throws (rate limit, timeout), nothing gets persisted, so GitHub's
    // native webhook redelivery retries the whole flow cleanly. Creating
    // the run first would make a failed delivery leave a "queued" row that
    // a later redelivery would treat as already-handled (via the
    // idempotency check above) without ever actually fetching the diff.
    const diff = await scmAdapter.getDiff({
      repoFullName: repo.fullName,
      prNumber: params.prNumber,
      commitSha: params.commitSha,
    });

    const reviewRun = ReviewRun.create({
      repoId: params.repoId,
      prNumber: params.prNumber,
      commitSha: params.commitSha,
      trigger: "webhook",
    });
    await this.reviewRunRepository.save(reviewRun);

    // Best-effort, never blocks this response — see
    // reconcilePendingSuggestions below. Only runs when the payload actually
    // carried a previous commit (real "before" on a synchronize event); an
    // opened/reopened PR, or an older Action version, has nothing to
    // reconcile against.
    if (params.action === "synchronize" && params.previousCommitSha) {
      await this.reconcilePendingSuggestions(
        params.repoId,
        params.prNumber,
        params.previousCommitSha,
        params.commitSha,
      );
    }

    // The diff is never persisted (it may contain source code) — it only
    // ever travels in memory and in this queue message, same as the Action
    // ingestion path.
    await this.queue.publish({
      url: `${config.BACKEND_PUBLIC_URL}/internal/review-runs/${reviewRun.id.value}/process`,
      body: { diff, prTitle: params.prTitle, prDescription: params.prDescription },
      headers: { Authorization: `Bearer ${config.INTERNAL_PROCESS_API_KEY}` },
    });

    return success({ kind: "accepted", reviewRun, isNew: true });
  }

  // Never lets a failure here affect the ingestion response or the new
  // ReviewRun — same best-effort spirit as the welcome message in
  // ProcessReviewRunUseCase. Covers both an expected business failure
  // (Result.ok === false) and an unexpected throw (a transient GitHub API
  // error propagating out of reconcileSuggestionApplications).
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
