import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { failure, Result, success } from "../../../../shared/core/result";
import { logger } from "../../../../logger";
import { Comment } from "../../../domain/entities/comment.entity";
import { LlmProvider } from "../../../domain/entities/repo-config.entity";
import { ReviewRun, ReviewRunStatus } from "../../../domain/entities/review-run.entity";
import { ReviewTurn } from "../../../domain/entities/review-turn.entity";
import { LlmProviderPort } from "../../../domain/ports/llm-provider.port";
import { Diff } from "../../../domain/ports/scm-adapter.port";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReviewTurnRepository } from "../../../domain/repository/review-turn.repository";
import { attributeCommentCost } from "../../../domain/services/attribute-comment-cost";
import { calculateEstimatedCost } from "../../../domain/services/calculate-estimated-cost";
import { extractRangeContent } from "../../../domain/services/extract-range-content";
import { extractSuggestionContext } from "../../../domain/services/extract-suggestion-context";
import { isDuplicatePendingSuggestion } from "../../../domain/services/is-duplicate-pending-suggestion";
import { publishComments } from "../../../domain/services/publish-comments";
import { buildOverviewComment } from "../../../domain/services/review-overview-comment";
import { review } from "../../../domain/services/review-service";
import { suggestedCodeMismatchesActualRange } from "../../../domain/services/suggested-code-mismatches-actual-range";
import { suggestedCodeOverlapsBoundary } from "../../../domain/services/suggested-code-overlaps-boundary";
import { buildWelcomeMessage } from "../../../domain/services/welcome-message";
import { ClaudeLlmProvider } from "../../../integration/claude/claude-llm-provider";
import { GeminiLlmProvider } from "../../../integration/gemini/gemini-llm-provider";
import { GithubScmAdapter } from "../../../integration/github/github-scm-adapter";
import { OpenAiLlmProvider } from "../../../integration/openai/openai-llm-provider";

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

// Not a factory in application/container/ — only one call site, same
// precedent as GithubScmAdapter being instantiated inline below (a single
// SCM provider never needed one either). Exhaustive switch over the
// LlmProvider union: adding a fourth provider to the catalog without a
// matching case here fails the build, not silently at runtime.
function createLlmProvider(provider: LlmProvider, apiKey: string, model: string): LlmProviderPort {
  switch (provider) {
    case "gemini":
      return new GeminiLlmProvider(apiKey, model);
    case "claude":
      return new ClaudeLlmProvider(apiKey, model);
    case "openai":
      return new OpenAiLlmProvider(apiKey, model);
  }
}

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
    private readonly promptRepository: PromptRepository,
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

    const llmProvider = createLlmProvider(
      repoConfig.llmProvider,
      decrypt(llmCredential.encryptedSecret),
      repoConfig.model,
    );
    const scmAdapter = new GithubScmAdapter(decrypt(scmCredential.encryptedSecret));

    // prompt === null here with promptId set can only happen in a window
    // that's effectively impossible in practice (onDelete: SetNull is
    // synchronous with the Postgres DELETE) — treated as "no custom
    // instructions" (undefined), never as a failure of this run.
    const prompt = repoConfig.promptId
      ? await this.promptRepository.findById(repoConfig.promptId)
      : null;

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

    const [result, , pendingSuggestions] = await Promise.all([
      review(
        params.diff,
        {
          tokenLimit: repoConfig.tokenLimit,
          temperature: repoConfig.temperature,
          enabledCategories: repoConfig.enabledCategories,
          reviewLanguage: repoConfig.reviewLanguage,
          customInstructions: prompt?.content,
          prTitle: params.prTitle,
          prDescription: params.prDescription,
        },
        { llmProvider },
      ),
      welcomePromise,
      // Every ReviewRun re-reviews the whole PR (review-service.ts), not an
      // increment — so an issue still open from an earlier push can come
      // back verbatim. Fetched here, before generation even needs it, so
      // it's ready the moment the comment-persistence loop below runs.
      this.commentRepository.findPendingSuggestionsByRepoIdAndPrNumber(
        reviewRun.repoId,
        reviewRun.prNumber,
      ),
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
    // Split against the whole turn's own totals — not the run's — since v1
    // always produces exactly one turn (see the comment above) and every
    // comment in result.comments came from generating that one call.
    const attributedCosts = persistedTurns[0]
      ? attributeCommentCost(result.comments, {
          inputTokens: persistedTurns[0].inputTokens,
          outputTokens: persistedTurns[0].outputTokens,
          reasoningTokens: persistedTurns[0].reasoningTokens,
        })
      : [];
    const persistedComments: Comment[] = [];
    if (turnId) {
      for (const [index, raw] of result.comments.entries()) {
        if (isDuplicatePendingSuggestion(raw, pendingSuggestions)) {
          continue;
        }
        const context = extractSuggestionContext(params.diff, raw.file, raw.line, raw.endLine);

        // Two distinct corruption risks, both only checkable here (after
        // context/the diff are available — the parser has no access to
        // actual file content):
        // 1. A multi-line suggestedCode that re-includes the line just
        //    outside its own declared range (e.g. the model wrote a whole
        //    function but only declared the body as the range) would apply
        //    as a duplicate of that neighbor.
        // 2. A range that points at a real block of code, but suggestedCode
        //    describes a completely different block elsewhere in the file
        //    (confirmed live: the model occasionally miscounts lines in a
        //    diff with many small, similarly-shaped functions) — applying
        //    it overwrites the wrong block entirely.
        // Both are the exact corruption class this platform must never risk.
        const isMultiLineActionable =
          raw.kind === "actionable" && raw.endLine > raw.line && raw.suggestedCode !== null;
        const overlapsBoundary =
          isMultiLineActionable &&
          suggestedCodeOverlapsBoundary(
            raw.suggestedCode as string,
            context.contextBefore,
            context.contextAfter,
          );
        const mismatchesActualRange =
          isMultiLineActionable &&
          (() => {
            const actualRangeLines = extractRangeContent(
              params.diff,
              raw.file,
              raw.line,
              raw.endLine,
            );
            // No actual content found for the declared range at all (e.g. it
            // doesn't correspond to a real hunk) is itself already unsafe —
            // there's nothing there to safely replace.
            return (
              actualRangeLines === null ||
              suggestedCodeMismatchesActualRange(actualRangeLines, raw.suggestedCode as string)
            );
          })();
        const isUnsafeMultiLineSuggestion = overlapsBoundary || mismatchesActualRange;

        // attributedCosts is parallel to result.comments — always defined at
        // a valid index; the fallback only appeases noUncheckedIndexedAccess.
        const cost = attributedCosts[index] ?? {
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
        };
        const comment = Comment.create({
          reviewRunId: reviewRun.id.value,
          reviewTurnId: turnId,
          file: raw.file,
          line: raw.line,
          endLine: raw.endLine,
          category: raw.category,
          severity: raw.severity,
          body: raw.body,
          kind: isUnsafeMultiLineSuggestion ? "observation" : raw.kind,
          suggestedCode: isUnsafeMultiLineSuggestion ? null : raw.suggestedCode,
          contextBefore: context.contextBefore,
          contextAfter: context.contextAfter,
          inputTokens: cost.inputTokens,
          outputTokens: cost.outputTokens,
          reasoningTokens: cost.reasoningTokens,
          estimatedCost: calculateEstimatedCost(repoConfig.llmProvider, repoConfig.model, cost),
        });
        await this.commentRepository.save(comment);
        persistedComments.push(comment);
      }
    }

    reviewRun.totalInputTokens = persistedTurns.reduce((sum, t) => sum + t.inputTokens, 0);
    reviewRun.totalOutputTokens = persistedTurns.reduce((sum, t) => sum + t.outputTokens, 0);
    reviewRun.totalReasoningTokens = persistedTurns.reduce((sum, t) => sum + t.reasoningTokens, 0);
    reviewRun.estimatedCost = calculateEstimatedCost(repoConfig.llmProvider, repoConfig.model, {
      inputTokens: reviewRun.totalInputTokens,
      outputTokens: reviewRun.totalOutputTokens,
      reasoningTokens: reviewRun.totalReasoningTokens,
    });

    const publishResult = await publishComments({
      scmAdapter,
      commentRepository: this.commentRepository,
      repoFullName: repo.fullName,
      prNumber: reviewRun.prNumber,
      commitSha: reviewRun.commitSha,
      comments: persistedComments,
    });

    // Only ever set when result.comments is empty (see review-service.ts) —
    // a single general PR comment standing in for the "nothing to flag, but
    // here's what's worth knowing" case, instead of either silence or
    // padding comments with praise. Best-effort, same as the welcome
    // message: a failure here is logged and never surfaces as this run's
    // own error, since the real review already succeeded regardless.
    if (result.overview) {
      await scmAdapter
        .publishGeneralComment({
          repoFullName: repo.fullName,
          prNumber: reviewRun.prNumber,
          body: buildOverviewComment(result.overview),
        })
        .catch((error) => {
          logger.warn("Overview comment failed to publish", {
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }

    // A publish failure is recorded but doesn't turn a successful generation
    // into a failed run — publishing is best-effort, it never derails an
    // otherwise-completed execution. Falls back to the turn's own errorReason
    // (e.g. the LLM call failed, or its response didn't parse — a malformed
    // custom prompt is a new way to reach this) so a run that produced zero
    // comments because generation itself failed isn't indistinguishable from
    // a genuinely clean PR — v1 always has exactly one turn (review-service.ts).
    reviewRun.status = "completed";
    reviewRun.errorReason = publishResult.errorReason ?? persistedTurns[0]?.errorReason ?? null;
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
