import { failure, Result, success } from "../../../../shared/core/result";
import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { CommentApplyEventRepository } from "../../../domain/repository/comment-apply-event.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { reconcileSuggestionApplications } from "../../../domain/services/reconcile-suggestion-applications";
import { GithubScmAdapter } from "../../../integration/github/github-scm-adapter";

export type ReconcileSuggestionApplicationsParams = {
  repoId: string;
  prNumber: number;
  previousCommitSha: string;
  newCommitSha: string;
};

export type ReconcileSuggestionApplicationsError = "repo_not_found" | "scm_credential_missing";

// Always called best-effort by its trigger points (ingest-webhook /
// ingest-action use cases) — a failure here never blocks the normal
// ingestion/review flow, same spirit as publishComments never failing a
// ReviewRun. This use case itself just surfaces the two business failure
// modes as a Result; it's the caller's job to swallow them.
export class ReconcileSuggestionApplicationsUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly commentRepository: CommentRepository,
    private readonly commentApplyEventRepository: CommentApplyEventRepository,
  ) {}

  async execute(
    params: ReconcileSuggestionApplicationsParams,
  ): Promise<Result<void, ReconcileSuggestionApplicationsError>> {
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

    const scmAdapter = new GithubScmAdapter(decrypt(scmCredential.encryptedSecret));

    await reconcileSuggestionApplications({
      scmAdapter,
      commentRepository: this.commentRepository,
      commentApplyEventRepository: this.commentApplyEventRepository,
      repoFullName: repo.fullName,
      repoId: params.repoId,
      prNumber: params.prNumber,
      previousCommitSha: params.previousCommitSha,
      newCommitSha: params.newCommitSha,
    });

    return success(undefined);
  }
}
