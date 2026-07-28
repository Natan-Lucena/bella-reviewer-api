import { config } from "../../../../config";
import { Result, success } from "../../../../shared/core/result";
import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { QueuePort } from "../../../domain/ports/queue.port";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { GithubScmAdapter } from "../../../integration/github/github-scm-adapter";

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
}
