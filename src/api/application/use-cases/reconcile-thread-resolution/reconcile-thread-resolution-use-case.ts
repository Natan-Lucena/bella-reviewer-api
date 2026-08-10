import { failure, Result, success } from "../../../../shared/core/result";
import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { CommentApplyEvent } from "../../../domain/entities/comment-apply-event.entity";
import { CommentApplyEventRepository } from "../../../domain/repository/comment-apply-event.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { normalizeMultilineCode, readFileRange } from "../../../domain/services/read-file-range";
import { relocateSuggestionLine } from "../../../domain/services/relocate-suggestion-line";
import { GithubScmAdapter } from "../../../integration/github/github-scm-adapter";

export type ReconcileThreadResolutionParams = {
  repoId: string;
  externalId: string;
  headCommitSha: string;
};

export type ReconcileThreadResolutionError = "repo_not_found" | "scm_credential_missing";

// Called when a GitHub review thread is resolved — a signal independent of
// any push. Unlike reconcile-suggestion-applications.ts (three-way branch:
// superseded/applied/pending), this is deliberately binary: a human just
// took an explicit action on this thread, so there's no more "still
// pending" outcome to preserve — either the content matches (applied
// manually, just never generated a fresh push afterwards) or it doesn't
// (dismissed).
export class ReconcileThreadResolutionUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly commentRepository: CommentRepository,
    private readonly commentApplyEventRepository: CommentApplyEventRepository,
  ) {}

  async execute(
    params: ReconcileThreadResolutionParams,
  ): Promise<Result<void, ReconcileThreadResolutionError>> {
    const [repo, scmCredential] = await Promise.all([
      this.repoRepository.findById(params.repoId),
      this.credentialRepository.findByRepoIdAndType(params.repoId, "scm"),
    ]);
    if (!repo) {
      return failure("repo_not_found");
    }
    if (!scmCredential?.encryptedSecret) {
      return failure("scm_credential_missing");
    }

    const comment = await this.commentRepository.findByExternalId(params.externalId);
    if (!comment || comment.applyStatus !== "pending") {
      // A thread with no pending suggestion behind it (already reconciled,
      // or never a suggestion at all) resolving is a normal, common event —
      // not an error, just nothing to do.
      return success(undefined);
    }

    const scmAdapter = new GithubScmAdapter(decrypt(scmCredential.encryptedSecret));
    const content = await scmAdapter.getFileContent({
      repoFullName: repo.fullName,
      ref: params.headCommitSha,
      path: comment.file,
    });
    const lines = content?.split("\n") ?? [];
    // Relocates via contextBefore/contextAfter when available (DT-01) — same
    // reasoning as reconcile-suggestion-applications.ts. A resolved thread
    // has no "still pending" outcome to fall back to, so an unrelocatable
    // drift (relocatedIndex === null) is treated the same as a plain
    // mismatch below: not confirmed as applied, so dismissed — exactly the
    // pre-existing behavior for a stale line, never a regression.
    // Same range semantics as reconcile-suggestion-applications.ts — reads
    // endLine - line + 1 lines starting at the relocated index.
    const lineCount = comment.endLine - comment.line + 1;
    const relocatedIndex = relocateSuggestionLine(lines, {
      line: comment.line,
      contextBefore: comment.contextBefore,
      contextAfter: comment.contextAfter,
      rangeLength: lineCount,
    });
    const actualContent =
      relocatedIndex !== null ? readFileRange(lines, relocatedIndex, lineCount) : null;
    const expectedContent = normalizeMultilineCode(comment.suggestedCode ?? "");
    const matches = actualContent !== null && actualContent === expectedContent;

    const status = matches ? "applied_manual" : "dismissed";
    const relocated = relocatedIndex !== null && relocatedIndex !== comment.line - 1;
    const detectionMethod = matches
      ? relocated
        ? "content_match_relocated"
        : "content_match"
      : "thread_resolved_without_match";

    const updated = comment.markApplyStatus(status, {
      commitSha: params.headCommitSha,
      detectionMethod,
    });
    await this.commentRepository.save(updated);
    await this.commentApplyEventRepository.save(
      CommentApplyEvent.create({
        commentId: updated.id.value,
        newStatus: status,
        commitSha: params.headCommitSha,
        detectionMethod,
      }),
    );

    return success(undefined);
  }
}
