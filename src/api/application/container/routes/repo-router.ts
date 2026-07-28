import { Router } from "express";

import { UseCaseFactory } from "../factories/use-cases-factory";
import { CreateRepoController } from "../../use-cases/create-repo/create-repo-controller";
import { GenerateActionTokenController } from "../../use-cases/generate-action-token/generate-action-token-controller";
import { GenerateWebhookSecretController } from "../../use-cases/generate-webhook-secret/generate-webhook-secret-controller";
import { GetRepoDashboardController } from "../../use-cases/get-repo-dashboard/get-repo-dashboard-controller";
import { GetReviewRunDetailController } from "../../use-cases/get-review-run-detail/get-review-run-detail-controller";
import { ListCommentsController } from "../../use-cases/list-comments/list-comments-controller";
import { ListReposController } from "../../use-cases/list-repos/list-repos-controller";
import { ListReviewRunsController } from "../../use-cases/list-review-runs/list-review-runs-controller";
import { SetLlmCredentialController } from "../../use-cases/set-llm-credential/set-llm-credential-controller";
import { SetScmCredentialController } from "../../use-cases/set-scm-credential/set-scm-credential-controller";
import { UpdateRepoConfigController } from "../../use-cases/update-repo-config/update-repo-config-controller";
import { authMiddleware } from "../middlewares/auth-middleware";

export class RepoRouter {
  public readonly router: Router;
  private readonly useCasesFactory = new UseCaseFactory();

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get("/", authMiddleware, (req, res) =>
      new ListReposController(this.useCasesFactory.makeListReposUseCase()).execute(req, res),
    );

    this.router.post("/", authMiddleware, (req, res) =>
      new CreateRepoController(this.useCasesFactory.makeCreateRepoUseCase()).execute(req, res),
    );

    this.router.patch("/:id/config", authMiddleware, (req, res) =>
      new UpdateRepoConfigController(this.useCasesFactory.makeUpdateRepoConfigUseCase()).execute(
        req,
        res,
      ),
    );

    this.router.post("/:id/credentials/llm", authMiddleware, (req, res) =>
      new SetLlmCredentialController(this.useCasesFactory.makeSetLlmCredentialUseCase()).execute(
        req,
        res,
      ),
    );

    this.router.post("/:id/credentials/scm", authMiddleware, (req, res) =>
      new SetScmCredentialController(this.useCasesFactory.makeSetScmCredentialUseCase()).execute(
        req,
        res,
      ),
    );

    this.router.post("/:id/action-token", authMiddleware, (req, res) =>
      new GenerateActionTokenController(
        this.useCasesFactory.makeGenerateActionTokenUseCase(),
      ).execute(req, res),
    );

    this.router.post("/:id/webhook-secret", authMiddleware, (req, res) =>
      new GenerateWebhookSecretController(
        this.useCasesFactory.makeGenerateWebhookSecretUseCase(),
      ).execute(req, res),
    );

    this.router.get("/:id/dashboard", authMiddleware, (req, res) =>
      new GetRepoDashboardController(this.useCasesFactory.makeGetRepoDashboardUseCase()).execute(
        req,
        res,
      ),
    );

    this.router.get("/:id/review-runs", authMiddleware, (req, res) =>
      new ListReviewRunsController(this.useCasesFactory.makeListReviewRunsUseCase()).execute(
        req,
        res,
      ),
    );

    this.router.get("/:id/review-runs/:runId", authMiddleware, (req, res) =>
      new GetReviewRunDetailController(
        this.useCasesFactory.makeGetReviewRunDetailUseCase(),
      ).execute(req, res),
    );

    this.router.get("/:id/comments", authMiddleware, (req, res) =>
      new ListCommentsController(this.useCasesFactory.makeListCommentsUseCase()).execute(req, res),
    );
  }
}
