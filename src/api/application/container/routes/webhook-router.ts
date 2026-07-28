import express, { Router } from "express";

import { UseCaseFactory } from "../factories/use-cases-factory";
import { IngestWebhookController } from "../../use-cases/ingest-webhook/ingest-webhook-controller";
import { createWebhookSignatureMiddleware } from "../middlewares/webhook-signature-middleware";

export class WebhookRouter {
  public readonly router: Router;
  private readonly useCasesFactory = new UseCaseFactory();

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    const webhookSignatureMiddleware = createWebhookSignatureMiddleware(
      this.useCasesFactory.getRepoRepository(),
      this.useCasesFactory.getCredentialRepository(),
    );

    // express.raw() must run before signature verification (HMAC needs the
    // exact bytes GitHub sent) and before the global express.json() —
    // this router is mounted ahead of that in src/index.ts for exactly
    // that reason.
    this.router.post(
      "/github",
      express.raw({ type: "application/json" }),
      webhookSignatureMiddleware,
      (req, res) =>
        new IngestWebhookController(this.useCasesFactory.makeIngestWebhookUseCase()).execute(
          req,
          res,
        ),
    );
  }
}
