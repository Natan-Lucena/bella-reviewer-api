import { config } from "../../../../config";
import { QstashQueue } from "../../../integration/qstash/qstash-queue";
import { CommentApplyEventRepositoryImpl } from "../../../infraestructure/CommentApplyEventRepositoryImpl";
import { CommentReplyRepositoryImpl } from "../../../infraestructure/CommentReplyRepositoryImpl";
import { CommentRepositoryImpl } from "../../../infraestructure/CommentRepositoryImpl";
import { CredentialRepositoryImpl } from "../../../infraestructure/CredentialRepositoryImpl";
import { PromptRepositoryImpl } from "../../../infraestructure/PromptRepositoryImpl";
import { RepoConfigRepositoryImpl } from "../../../infraestructure/RepoConfigRepositoryImpl";
import { RepoRepositoryImpl } from "../../../infraestructure/RepoRepositoryImpl";
import { ReviewRunRepositoryImpl } from "../../../infraestructure/ReviewRunRepositoryImpl";
import { ReviewTurnRepositoryImpl } from "../../../infraestructure/ReviewTurnRepositoryImpl";
import { UserRepositoryImpl } from "../../../infraestructure/UserRepositoryImpl";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { CreatePromptUseCase } from "../../use-cases/create-prompt/create-prompt-use-case";
import { CreateRepoUseCase } from "../../use-cases/create-repo/create-repo-use-case";
import { DeletePromptUseCase } from "../../use-cases/delete-prompt/delete-prompt-use-case";
import { FinalizeSuggestionReconciliationUseCase } from "../../use-cases/finalize-suggestion-reconciliation/finalize-suggestion-reconciliation-use-case";
import { GenerateActionTokenUseCase } from "../../use-cases/generate-action-token/generate-action-token-use-case";
import { GenerateWebhookSecretUseCase } from "../../use-cases/generate-webhook-secret/generate-webhook-secret-use-case";
import { GetAcceptanceMetricsUseCase } from "../../use-cases/get-acceptance-metrics/get-acceptance-metrics-use-case";
import { GetCurrentUserUseCase } from "../../use-cases/get-current-user/get-current-user-use-case";
import { GetRepoDashboardUseCase } from "../../use-cases/get-repo-dashboard/get-repo-dashboard-use-case";
import { GetReviewRunDetailUseCase } from "../../use-cases/get-review-run-detail/get-review-run-detail-use-case";
import { IngestActionUseCase } from "../../use-cases/ingest-action/ingest-action-use-case";
import { IngestCommentReplyUseCase } from "../../use-cases/ingest-comment-reply/ingest-comment-reply-use-case";
import { IngestWebhookUseCase } from "../../use-cases/ingest-webhook/ingest-webhook-use-case";
import { InstallActionUseCase } from "../../use-cases/install-action/install-action-use-case";
import { ListCommentsUseCase } from "../../use-cases/list-comments/list-comments-use-case";
import { ListGithubReposUseCase } from "../../use-cases/list-github-repos/list-github-repos-use-case";
import { ListPromptsUseCase } from "../../use-cases/list-prompts/list-prompts-use-case";
import { ListReposUseCase } from "../../use-cases/list-repos/list-repos-use-case";
import { ListReviewRunsUseCase } from "../../use-cases/list-review-runs/list-review-runs-use-case";
import { LoginUserUseCase } from "../../use-cases/login-user/login-user-use-case";
import { ProcessCommentReplyUseCase } from "../../use-cases/process-comment-reply/process-comment-reply-use-case";
import { ProcessReviewRunUseCase } from "../../use-cases/process-review-run/process-review-run-use-case";
import { ReconcileSuggestionApplicationsUseCase } from "../../use-cases/reconcile-suggestion-applications/reconcile-suggestion-applications-use-case";
import { ReconcileThreadResolutionUseCase } from "../../use-cases/reconcile-thread-resolution/reconcile-thread-resolution-use-case";
import { SetLlmCredentialUseCase } from "../../use-cases/set-llm-credential/set-llm-credential-use-case";
import { SetScmCredentialUseCase } from "../../use-cases/set-scm-credential/set-scm-credential-use-case";
import { SignupUserUseCase } from "../../use-cases/signup-user/signup-user-use-case";
import { UpdatePromptUseCase } from "../../use-cases/update-prompt/update-prompt-use-case";
import { UpdateRepoConfigUseCase } from "../../use-cases/update-repo-config/update-repo-config-use-case";

// Central place that decides which concrete repository implementation each
// use case gets. As more use cases are added (credentials, review runs, ...),
// their make*UseCase() methods land here too, instead of one factory file
// per feature.
export class UseCaseFactory {
  private readonly userRepository = new UserRepositoryImpl();
  private readonly repoRepository = new RepoRepositoryImpl();
  private readonly repoConfigRepository = new RepoConfigRepositoryImpl();
  private readonly credentialRepository = new CredentialRepositoryImpl();
  private readonly reviewRunRepository = new ReviewRunRepositoryImpl();
  private readonly reviewTurnRepository = new ReviewTurnRepositoryImpl();
  private readonly commentRepository = new CommentRepositoryImpl();
  private readonly commentApplyEventRepository = new CommentApplyEventRepositoryImpl();
  private readonly promptRepository = new PromptRepositoryImpl();
  private readonly commentReplyRepository = new CommentReplyRepositoryImpl();
  private readonly queue = new QstashQueue(config.QSTASH_TOKEN, config.QSTASH_URL);

  makeSignupUserUseCase(): SignupUserUseCase {
    return new SignupUserUseCase(this.userRepository);
  }

  makeLoginUserUseCase(): LoginUserUseCase {
    return new LoginUserUseCase(this.userRepository);
  }

  makeGetCurrentUserUseCase(): GetCurrentUserUseCase {
    return new GetCurrentUserUseCase(this.userRepository);
  }

  makeCreateRepoUseCase(): CreateRepoUseCase {
    return new CreateRepoUseCase(this.repoRepository, this.repoConfigRepository);
  }

  makeUpdateRepoConfigUseCase(): UpdateRepoConfigUseCase {
    return new UpdateRepoConfigUseCase(
      this.repoRepository,
      this.repoConfigRepository,
      this.promptRepository,
    );
  }

  makeSetLlmCredentialUseCase(): SetLlmCredentialUseCase {
    return new SetLlmCredentialUseCase(
      this.repoRepository,
      this.credentialRepository,
      this.repoConfigRepository,
    );
  }

  makeSetScmCredentialUseCase(): SetScmCredentialUseCase {
    return new SetScmCredentialUseCase(this.repoRepository, this.credentialRepository);
  }

  makeGenerateActionTokenUseCase(): GenerateActionTokenUseCase {
    return new GenerateActionTokenUseCase(this.repoRepository, this.credentialRepository);
  }

  makeGenerateWebhookSecretUseCase(): GenerateWebhookSecretUseCase {
    return new GenerateWebhookSecretUseCase(this.repoRepository, this.credentialRepository);
  }

  makeReconcileSuggestionApplicationsUseCase(): ReconcileSuggestionApplicationsUseCase {
    return new ReconcileSuggestionApplicationsUseCase(
      this.repoRepository,
      this.credentialRepository,
      this.commentRepository,
      this.commentApplyEventRepository,
    );
  }

  makeIngestActionUseCase(): IngestActionUseCase {
    return new IngestActionUseCase(
      this.reviewRunRepository,
      this.queue,
      this.makeReconcileSuggestionApplicationsUseCase(),
    );
  }

  makeIngestCommentReplyUseCase(): IngestCommentReplyUseCase {
    return new IngestCommentReplyUseCase(
      this.commentRepository,
      this.commentReplyRepository,
      this.queue,
    );
  }

  makeIngestWebhookUseCase(): IngestWebhookUseCase {
    return new IngestWebhookUseCase(
      this.reviewRunRepository,
      this.repoRepository,
      this.credentialRepository,
      this.queue,
      this.makeReconcileSuggestionApplicationsUseCase(),
    );
  }

  makeFinalizeSuggestionReconciliationUseCase(): FinalizeSuggestionReconciliationUseCase {
    return new FinalizeSuggestionReconciliationUseCase(
      this.repoRepository,
      this.commentRepository,
      this.commentApplyEventRepository,
    );
  }

  makeReconcileThreadResolutionUseCase(): ReconcileThreadResolutionUseCase {
    return new ReconcileThreadResolutionUseCase(
      this.repoRepository,
      this.credentialRepository,
      this.commentRepository,
      this.commentApplyEventRepository,
    );
  }

  makeProcessReviewRunUseCase(): ProcessReviewRunUseCase {
    return new ProcessReviewRunUseCase(
      this.reviewRunRepository,
      this.repoRepository,
      this.repoConfigRepository,
      this.credentialRepository,
      this.reviewTurnRepository,
      this.commentRepository,
      this.promptRepository,
    );
  }

  makeIngestCommentReplyUseCase(): IngestCommentReplyUseCase {
    return new IngestCommentReplyUseCase(
      this.commentRepository,
      this.commentReplyRepository,
      this.queue,
    );
  }

  makeProcessCommentReplyUseCase(): ProcessCommentReplyUseCase {
    return new ProcessCommentReplyUseCase(
      this.commentReplyRepository,
      this.commentRepository,
      this.reviewRunRepository,
      this.repoRepository,
      this.repoConfigRepository,
      this.credentialRepository,
      this.promptRepository,
    );
  }

  makeListReposUseCase(): ListReposUseCase {
    return new ListReposUseCase(
      this.repoRepository,
      this.repoConfigRepository,
      this.credentialRepository,
    );
  }

  makeGetRepoDashboardUseCase(): GetRepoDashboardUseCase {
    return new GetRepoDashboardUseCase(
      this.repoRepository,
      this.repoConfigRepository,
      this.credentialRepository,
      this.reviewRunRepository,
    );
  }

  makeGetAcceptanceMetricsUseCase(): GetAcceptanceMetricsUseCase {
    return new GetAcceptanceMetricsUseCase(
      this.repoRepository,
      this.commentRepository,
      this.reviewRunRepository,
    );
  }

  makeListReviewRunsUseCase(): ListReviewRunsUseCase {
    return new ListReviewRunsUseCase(
      this.repoRepository,
      this.reviewRunRepository,
      this.commentRepository,
    );
  }

  makeGetReviewRunDetailUseCase(): GetReviewRunDetailUseCase {
    return new GetReviewRunDetailUseCase(
      this.repoRepository,
      this.reviewRunRepository,
      this.reviewTurnRepository,
      this.commentRepository,
    );
  }

  makeListGithubReposUseCase(): ListGithubReposUseCase {
    return new ListGithubReposUseCase(this.repoRepository);
  }

  makeInstallActionUseCase(): InstallActionUseCase {
    return new InstallActionUseCase(this.repoRepository);
  }

  makeListCommentsUseCase(): ListCommentsUseCase {
    return new ListCommentsUseCase(
      this.repoRepository,
      this.commentRepository,
      this.reviewRunRepository,
    );
  }

  makeCreatePromptUseCase(): CreatePromptUseCase {
    return new CreatePromptUseCase(this.promptRepository);
  }

  makeListPromptsUseCase(): ListPromptsUseCase {
    return new ListPromptsUseCase(this.promptRepository);
  }

  makeUpdatePromptUseCase(): UpdatePromptUseCase {
    return new UpdatePromptUseCase(this.promptRepository);
  }

  makeDeletePromptUseCase(): DeletePromptUseCase {
    return new DeletePromptUseCase(this.promptRepository);
  }

  // Exposed for action-token-middleware, which needs the same repository
  // instance to look up the BELLA_TOKEN by hash — it isn't a use case itself.
  getCredentialRepository(): CredentialRepository {
    return this.credentialRepository;
  }

  // Exposed for webhook-signature-middleware, which needs to resolve a repo
  // by full_name before it can even look up the webhook_secret — it isn't a
  // use case itself.
  getRepoRepository(): RepoRepository {
    return this.repoRepository;
  }
}
