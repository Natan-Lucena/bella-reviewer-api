import { Router } from "express";

import { UseCaseFactory } from "../factories/use-cases-factory";
import { IngestActionController } from "../../use-cases/ingest-action/ingest-action-controller";
import { IngestActionCommentReplyController } from "../../use-cases/ingest-comment-reply/ingest-action-comment-reply-controller";
import { createActionTokenMiddleware } from "../middlewares/action-token-middleware";

export class IngestionRouter {
  public readonly router: Router;
  private readonly useCasesFactory = new UseCaseFactory();

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    const actionTokenMiddleware = createActionTokenMiddleware(
      this.useCasesFactory.getCredentialRepository(),
    );

    this.router.post("/action", actionTokenMiddleware, (req, res) =>
      new IngestActionController(this.useCasesFactory.makeIngestActionUseCase()).execute(req, res),
    );

    this.router.post("/action/comment-replies", actionTokenMiddleware, (req, res) =>
      new IngestActionCommentReplyController(
        this.useCasesFactory.makeIngestCommentReplyUseCase(),
      ).execute(req, res),
    );
  }
}
