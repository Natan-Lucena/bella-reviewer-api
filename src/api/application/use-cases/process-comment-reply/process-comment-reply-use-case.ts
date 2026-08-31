import { failure, Result, success } from "../../../../shared/core/result";
import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { CommentReply, CommentReplyStatus } from "../../../domain/entities/comment-reply.entity";
import { CommentReplyRepository } from "../../../domain/repository/comment-reply.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { buildCommentReplyPrompt } from "../../../domain/services/comment-reply-prompt";
import { parseCommentReplyResponse } from "../../../domain/services/comment-reply-response-parser";
import { calculateEstimatedCost } from "../../../domain/services/calculate-estimated-cost";
import { createLlmProvider } from "../../../domain/services/create-llm-provider";
import { relocateSuggestionLine } from "../../../domain/services/relocate-suggestion-line";
import { GithubScmAdapter } from "../../../integration/github/github-scm-adapter";

export type ProcessCommentReplyParams = {
  commentReplyId: string;
  prNumber: number;
  commitSha: string;
  prTitle: string;
  prDescription: string | null;
};

export type ProcessCommentReplyResult = {
  commentReplyId: string;
  status: CommentReplyStatus;
};

export type ProcessCommentReplyError = "comment_reply_not_found";

// Mirrors ProcessReviewRunUseCase architecturally, but leaner: one comment
// thread, no diff, no welcome message — just resolving a human reply into a
// generated response and (best-effort) publishing it back to the thread.
export class ProcessCommentReplyUseCase {
  constructor(
    private readonly commentReplyRepository: CommentReplyRepository,
    private readonly commentRepository: CommentRepository,
    private readonly reviewRunRepository: ReviewRunRepository,
    private readonly repoRepository: RepoRepository,
    private readonly repoConfigRepository: RepoConfigRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly promptRepository: PromptRepository,
  ) {}

  async execute(
    params: ProcessCommentReplyParams,
  ): Promise<Result<ProcessCommentReplyResult, ProcessCommentReplyError>> {
    const commentReply = await this.commentReplyRepository.findById(params.commentReplyId);
    if (!commentReply) {
      return failure("comment_reply_not_found");
    }

    commentReply.status = "processing";
    await this.commentReplyRepository.save(commentReply);

    const originalComment = await this.commentRepository.findById(commentReply.commentId);
    // originalComment always exists here — FK guarantees it, no defensive
    // null-check for an impossible scenario.

    const reviewRun = await this.reviewRunRepository.findById(originalComment!.reviewRunId);
    const [repo, repoConfig, llmCredential, scmCredential] = await Promise.all([
      this.repoRepository.findById(reviewRun!.repoId),
      this.repoConfigRepository.findByRepoId(reviewRun!.repoId),
      this.credentialRepository.findByRepoIdAndType(reviewRun!.repoId, "llm"),
      this.credentialRepository.findByRepoIdAndType(reviewRun!.repoId, "scm"),
    ]);

    if (!repo || !repoConfig || !llmCredential?.encryptedSecret || !scmCredential?.encryptedSecret) {
      const errorReason = !llmCredential?.encryptedSecret
        ? "LLM credential not configured"
        : !scmCredential?.encryptedSecret
          ? "SCM credential not configured"
          : "Repository configuration not found";
      return this.finishAsFailed(commentReply, errorReason);
    }

    const llmProvider = createLlmProvider(
      repoConfig.llmProvider,
      decrypt(llmCredential.encryptedSecret),
      repoConfig.model,
    );
    const scmAdapter = new GithubScmAdapter(decrypt(scmCredential.encryptedSecret));

    // Same pattern as ProcessReviewRunUseCase: prompt === null here with
    // promptId set can only happen in a window that's effectively
    // impossible in practice (onDelete: SetNull is synchronous with the
    // Postgres DELETE) — treated as "no custom instructions", never a
    // failure of this reply.
    const prompt = repoConfig.promptId
      ? await this.promptRepository.findById(repoConfig.promptId)
      : null;

    const priorReplies = await this.commentReplyRepository.findByCommentId(commentReply.commentId);
    const priorExchanges = priorReplies
      .filter((r) => r.id.value !== commentReply.id.value && r.status === "completed" && r.bellaBody)
      .map((r) => ({ humanBody: r.humanBody, bellaBody: r.bellaBody! }));

    // The other comments already published in this same ReviewRun, excluding
    // this thread's own — gives the model context of the rest of the review.
    const otherComments = (await this.commentRepository.findByReviewRunId(reviewRun!.id.value))
      .filter((c) => c.id.value !== originalComment!.id.value && c.status === "published")
      .map((c) => ({ file: c.file, line: c.line, category: c.category, severity: c.severity, body: c.body }));

    let generated: { body: string; suggestedCode: string | null; category: CommentReply["category"] };
    try {
      const generationPrompt = buildCommentReplyPrompt({
        prTitle: params.prTitle,
        prDescription: params.prDescription,
        customInstructions: prompt?.content,
        otherComments,
        file: originalComment!.file,
        originalCategory: originalComment!.category,
        originalSeverity: originalComment!.severity,
        originalBody: originalComment!.body,
        originalSuggestedCode: originalComment!.suggestedCode,
        contextBefore: originalComment!.contextBefore,
        contextAfter: originalComment!.contextAfter,
        priorExchanges,
        humanBody: commentReply.humanBody,
        reviewLanguage: repoConfig.reviewLanguage,
        temperature: repoConfig.temperature,
      });
      const result = await llmProvider.generate(generationPrompt);
      generated = parseCommentReplyResponse(result.content);
      commentReply.inputTokens = result.tokensInput;
      commentReply.outputTokens = result.tokensOutput;
      commentReply.reasoningTokens = result.tokensReasoning;
      commentReply.estimatedCost = calculateEstimatedCost(repoConfig.llmProvider, repoConfig.model, {
        inputTokens: result.tokensInput,
        outputTokens: result.tokensOutput,
        reasoningTokens: result.tokensReasoning,
      });
    } catch (error) {
      return this.finishAsFailed(commentReply, error instanceof Error ? error.message : String(error));
    }

    // suggestedCode is only published as an applicable block if the
    // original comment's range still anchors reliably in the ACTUAL current
    // file content — the range is inherited from the original Comment (a
    // reply can't re-anchor), so if the surrounding code shifted since the
    // original review, blindly applying it risks the same corruption
    // ProcessReviewRunUseCase already guards against. Unlike there (which
    // compares against a diff in hand), there's no fresh diff here — same
    // technique as ReconcileThreadResolutionUseCase: fetch the current file
    // at the current commit and relocate via contextBefore/contextAfter.
    let safeSuggestedCode = generated.suggestedCode;
    if (safeSuggestedCode) {
      const content = await scmAdapter.getFileContent({
        repoFullName: repo.fullName,
        ref: params.commitSha,
        path: originalComment!.file,
      });
      const lines = content?.split("\n") ?? [];
      const relocatedIndex = relocateSuggestionLine(lines, {
        line: originalComment!.line,
        contextBefore: originalComment!.contextBefore,
        contextAfter: originalComment!.contextAfter,
        rangeLength: safeSuggestedCode.split("\n").length,
      });
      if (relocatedIndex === null) {
        safeSuggestedCode = null;
      }
    }

    try {
      const published = await scmAdapter.replyToComment({
        repoFullName: repo.fullName,
        prNumber: params.prNumber,
        // Always present — findByExternalId already required this to get here.
        inReplyToExternalId: originalComment!.externalId!,
        body: generated.body,
        suggestedCode: safeSuggestedCode,
      });
      commentReply.bellaBody = generated.body;
      commentReply.bellaSuggestedCode = safeSuggestedCode;
      commentReply.bellaExternalId = published.externalId;
      commentReply.category = generated.category;
      commentReply.status = "completed";
    } catch (error) {
      // Generation succeeded, publishing failed — same spirit as
      // ProcessReviewRunUseCase: "completed" with an errorReason is more
      // honest than "failed" (which would suggest nothing was produced).
      commentReply.bellaBody = generated.body;
      commentReply.bellaSuggestedCode = safeSuggestedCode;
      commentReply.category = generated.category;
      commentReply.status = "completed";
      commentReply.errorReason = error instanceof Error ? error.message : String(error);
    }

    commentReply.completedAt = new Date();
    await this.commentReplyRepository.save(commentReply);
    return success({ commentReplyId: commentReply.id.value, status: commentReply.status });
  }

  private async finishAsFailed(
    commentReply: CommentReply,
    errorReason: string,
  ): Promise<Result<ProcessCommentReplyResult, ProcessCommentReplyError>> {
    commentReply.status = "failed";
    commentReply.errorReason = errorReason;
    commentReply.completedAt = new Date();
    await this.commentReplyRepository.save(commentReply);

    return success({ commentReplyId: commentReply.id.value, status: "failed" });
  }
}
