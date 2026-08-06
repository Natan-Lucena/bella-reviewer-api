import { failure, Result, success } from "../../../../shared/core/result";
import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { CommentApplyEvent } from "../../../domain/entities/comment-apply-event.entity";
import { CommentApplyEventRepository } from "../../../domain/repository/comment-apply-event.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
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
    const actualLine = (lines[comment.line - 1] ?? "").trim();
    const expectedLine = (comment.suggestedCode ?? "").trim();
    const matches = actualLine === expectedLine;

    const status = matches ? "applied_manual" : "dismissed";
    const detectionMethod = matches ? "content_match" : "thread_resolved_without_match";

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
