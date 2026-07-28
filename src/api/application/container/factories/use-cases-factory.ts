import { config } from "../../../../config";
import { QstashQueue } from "../../../integration/qstash/qstash-queue";
import { CommentRepositoryImpl } from "../../../infraestructure/CommentRepositoryImpl";
import { CredentialRepositoryImpl } from "../../../infraestructure/CredentialRepositoryImpl";
import { RepoConfigRepositoryImpl } from "../../../infraestructure/RepoConfigRepositoryImpl";
import { RepoRepositoryImpl } from "../../../infraestructure/RepoRepositoryImpl";
import { ReviewRunRepositoryImpl } from "../../../infraestructure/ReviewRunRepositoryImpl";
import { ReviewTurnRepositoryImpl } from "../../../infraestructure/ReviewTurnRepositoryImpl";
import { UserRepositoryImpl } from "../../../infraestructure/UserRepositoryImpl";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { CreateRepoUseCase } from "../../use-cases/create-repo/create-repo-use-case";
import { GenerateActionTokenUseCase } from "../../use-cases/generate-action-token/generate-action-token-use-case";
import { GenerateWebhookSecretUseCase } from "../../use-cases/generate-webhook-secret/generate-webhook-secret-use-case";
import { GetCurrentUserUseCase } from "../../use-cases/get-current-user/get-current-user-use-case";
import { IngestActionUseCase } from "../../use-cases/ingest-action/ingest-action-use-case";
import { LoginUserUseCase } from "../../use-cases/login-user/login-user-use-case";
import { ProcessReviewRunUseCase } from "../../use-cases/process-review-run/process-review-run-use-case";
import { SetLlmCredentialUseCase } from "../../use-cases/set-llm-credential/set-llm-credential-use-case";
import { SetScmCredentialUseCase } from "../../use-cases/set-scm-credential/set-scm-credential-use-case";
import { SignupUserUseCase } from "../../use-cases/signup-user/signup-user-use-case";
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
    return new UpdateRepoConfigUseCase(this.repoRepository, this.repoConfigRepository);
  }

  makeSetLlmCredentialUseCase(): SetLlmCredentialUseCase {
    return new SetLlmCredentialUseCase(this.repoRepository, this.credentialRepository);
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

  makeIngestActionUseCase(): IngestActionUseCase {
    return new IngestActionUseCase(this.reviewRunRepository, this.queue);
  }

  makeProcessReviewRunUseCase(): ProcessReviewRunUseCase {
    return new ProcessReviewRunUseCase(
      this.reviewRunRepository,
      this.repoRepository,
      this.repoConfigRepository,
      this.credentialRepository,
      this.reviewTurnRepository,
      this.commentRepository,
    );
  }

  // Exposed for action-token-middleware, which needs the same repository
  // instance to look up the BELLA_TOKEN by hash — it isn't a use case itself.
  getCredentialRepository(): CredentialRepository {
    return this.credentialRepository;
  }
}
