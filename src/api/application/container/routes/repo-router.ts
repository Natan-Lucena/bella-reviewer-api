import { Router } from "express";

import { UseCaseFactory } from "../factories/use-cases-factory";
import { CreateRepoController } from "../../use-cases/create-repo/create-repo-controller";
import { GenerateActionTokenController } from "../../use-cases/generate-action-token/generate-action-token-controller";
import { GenerateWebhookSecretController } from "../../use-cases/generate-webhook-secret/generate-webhook-secret-controller";
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
  }
}
