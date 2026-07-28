import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { failure, Result, success } from "../../../../shared/core/result";
import { logger } from "../../../../logger";
import { Comment } from "../../../domain/entities/comment.entity";
import { ReviewRun, ReviewRunStatus } from "../../../domain/entities/review-run.entity";
import { ReviewTurn } from "../../../domain/entities/review-turn.entity";
import { Diff } from "../../../domain/ports/scm-adapter.port";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReviewTurnRepository } from "../../../domain/repository/review-turn.repository";
import { publishComments } from "../../../domain/services/publish-comments";
import { review } from "../../../domain/services/review-service";
import { buildWelcomeMessage } from "../../../domain/services/welcome-message";
import { GeminiLlmProvider } from "../../../integration/gemini/gemini-llm-provider";
import { GithubScmAdapter } from "../../../integration/github/github-scm-adapter";

export type ProcessReviewRunParams = {
  reviewRunId: string;
  diff: Diff;
  prTitle?: string;
  prDescription?: string;
};

export type ProcessReviewRunResult = {
  reviewRunId: string;
  status: ReviewRunStatus;
};

export type ProcessReviewRunError = "review_run_not_found";

// The orchestrator use case: the glue between infrastructure (database,
// encrypted credentials, concrete adapters) and the pure review core
// (domain/services/review-service.ts), which never sees any of that.
export class ProcessReviewRunUseCase {
  constructor(
    private readonly reviewRunRepository: ReviewRunRepository,
    private readonly repoRepository: RepoRepository,
    private readonly repoConfigRepository: RepoConfigRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly reviewTurnRepository: ReviewTurnRepository,
    private readonly commentRepository: CommentRepository,
  ) {}

  async execute(
    params: ProcessReviewRunParams,
  ): Promise<Result<ProcessReviewRunResult, ProcessReviewRunError>> {
    const reviewRun = await this.reviewRunRepository.findById(params.reviewRunId);
    if (!reviewRun) {
      return failure("review_run_not_found");
    }

    reviewRun.status = "processing";
    reviewRun.startedAt = new Date();
    await this.reviewRunRepository.save(reviewRun);

    const [repo, repoConfig, llmCredential, scmCredential] = await Promise.all([
      this.repoRepository.findById(reviewRun.repoId),
      this.repoConfigRepository.findByRepoId(reviewRun.repoId),
      this.credentialRepository.findByRepoIdAndType(reviewRun.repoId, "llm"),
      this.credentialRepository.findByRepoIdAndType(reviewRun.repoId, "scm"),
    ]);

    // A missing credential/config is a business failure (the repo is
    // misconfigured), not a transient one — it'll fail identically on every
    // retry, so it's reported the same way as the token-limit failure below:
    // ReviewRun.status = failed, no turns/comments, no publish attempt.
    if (
      !repo ||
      !repoConfig ||
      !llmCredential?.encryptedSecret ||
      !scmCredential?.encryptedSecret
    ) {
      const errorReason = !llmCredential?.encryptedSecret
        ? "LLM credential not configured"
        : !scmCredential?.encryptedSecret
          ? "SCM credential not configured"
          : "Repository configuration not found";
      return this.finishAsFailed(reviewRun, errorReason);
    }

    const llmProvider = new GeminiLlmProvider(
      decrypt(llmCredential.encryptedSecret),
      repoConfig.model,
    );
    const scmAdapter = new GithubScmAdapter(decrypt(scmCredential.encryptedSecret));

    // "First ever" is measured by prior *completed* runs, not prior runs of
    // any status — a repo whose first attempt failed on missing credentials
    // (never got this far) still gets the welcome message once it actually
    // succeeds, instead of never getting it at all. This run's own status is
    // still "processing" at this point (set at the top of this method), so
    // it doesn't count against itself.
    const isFirstSuccessfulRunForRepo =
      (await this.reviewRunRepository.findByRepoId(reviewRun.repoId, { status: "completed" }))
        .total === 0;

    // Best-effort and never allowed to affect the real review: a failure
    // here (rate limit, revoked PAT that somehow still got this far) is
    // logged and swallowed, never surfaced as this run's failure reason.
    const welcomePromise = isFirstSuccessfulRunForRepo
      ? scmAdapter
          .publishGeneralComment({
            repoFullName: repo.fullName,
            prNumber: reviewRun.prNumber,
            body: buildWelcomeMessage(),
          })
          .catch((error) => {
            logger.warn("Welcome comment failed to publish", {
              message: error instanceof Error ? error.message : String(error),
            });
          })
      : Promise.resolve();

    const [result] = await Promise.all([
      review(
        params.diff,
        {
          tokenLimit: repoConfig.tokenLimit,
          temperature: repoConfig.temperature,
          enabledCategories: repoConfig.enabledCategories,
          prTitle: params.prTitle,
          prDescription: params.prDescription,
        },
        { llmProvider },
      ),
      welcomePromise,
    ]);

    if (result.totalFailure) {
      return this.finishAsFailed(reviewRun, result.totalFailure.reason);
    }

    const persistedTurns: ReviewTurn[] = [];
    for (const turn of result.turns) {
      const reviewTurn = ReviewTurn.create({
        reviewRunId: reviewRun.id.value,
        index: turn.index,
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        reasoningTokens: turn.reasoningTokens,
        errorReason: turn.errorReason,
      });
      await this.reviewTurnRepository.save(reviewTurn);
      persistedTurns.push(reviewTurn);
    }

    // v1 always produces exactly one turn at this point (a totalFailure
    // already returned above) — every comment in result.comments came from
    // that single turn.
    const turnId = persistedTurns[0]?.id.value;
    const persistedComments: Comment[] = [];
    if (turnId) {
      for (const raw of result.comments) {
        const comment = Comment.create({
          reviewRunId: reviewRun.id.value,
          reviewTurnId: turnId,
          file: raw.file,
          line: raw.line,
          category: raw.category,
          severity: raw.severity,
          body: raw.body,
        });
        await this.commentRepository.save(comment);
        persistedComments.push(comment);
      }
    }

    reviewRun.totalInputTokens = persistedTurns.reduce((sum, t) => sum + t.inputTokens, 0);
    reviewRun.totalOutputTokens = persistedTurns.reduce((sum, t) => sum + t.outputTokens, 0);
    reviewRun.totalReasoningTokens = persistedTurns.reduce((sum, t) => sum + t.reasoningTokens, 0);

    const publishResult = await publishComments({
      scmAdapter,
      commentRepository: this.commentRepository,
      repoFullName: repo.fullName,
      prNumber: reviewRun.prNumber,
      commitSha: reviewRun.commitSha,
      comments: persistedComments,
    });

    // A publish failure is recorded but doesn't turn a successful generation
    // into a failed run — publishing is best-effort, it never derails an
    // otherwise-completed execution.
    reviewRun.status = "completed";
    reviewRun.errorReason = publishResult.errorReason ?? null;
    reviewRun.completedAt = new Date();
    await this.reviewRunRepository.save(reviewRun);

    return success({ reviewRunId: reviewRun.id.value, status: reviewRun.status });
  }

  private async finishAsFailed(
    reviewRun: ReviewRun,
    errorReason: string,
  ): Promise<Result<ProcessReviewRunResult, ProcessReviewRunError>> {
    reviewRun.status = "failed";
    reviewRun.errorReason = errorReason;
    reviewRun.completedAt = new Date();
    await this.reviewRunRepository.save(reviewRun);

    return success({ reviewRunId: reviewRun.id.value, status: "failed" });
  }
}
