import express, { Request, Response, Router } from "express";

import { UseCaseFactory } from "../factories/use-cases-factory";
import { IngestCommentReplyController } from "../../use-cases/ingest-comment-reply/ingest-comment-reply-controller";
import { IngestWebhookController } from "../../use-cases/ingest-webhook/ingest-webhook-controller";
import { ReconcileThreadResolutionController } from "../../use-cases/reconcile-thread-resolution/reconcile-thread-resolution-controller";
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
    // that reason. The signature check itself only ever reads
    // repository.full_name, which every GitHub event type carries, so it
    // doesn't need to know about X-GitHub-Event at all.
    this.router.post(
      "/github",
      express.raw({ type: "application/json" }),
      webhookSignatureMiddleware,
      (req, res) => this.dispatchByEventType(req, res),
    );
  }

  // GitHub identifies the event type via a header, not the payload body —
  // each type has a different shape, so the right schema/controller has to
  // be chosen before any parsing happens.
  private dispatchByEventType(req: Request, res: Response): Promise<Response | void> {
    const eventType = req.header("X-GitHub-Event");

    switch (eventType) {
      case "pull_request":
        return new IngestWebhookController(
          this.useCasesFactory.makeIngestWebhookUseCase(),
          this.useCasesFactory.makeFinalizeSuggestionReconciliationUseCase(),
        ).execute(req, res);
      case "pull_request_review_thread":
        return new ReconcileThreadResolutionController(
          this.useCasesFactory.makeReconcileThreadResolutionUseCase(),
        ).execute(req, res);
      case "pull_request_review_comment":
        return new IngestCommentReplyController(
          this.useCasesFactory.makeIngestCommentReplyUseCase(),
        ).execute(req, res);
      default:
        // An event type this platform doesn't understand yet — acknowledged,
        // not an error, same convention as an unrecognized action within a
        // known event type.
        res.status(202).json({ ignored: true });
        return Promise.resolve();
    }
  }
}
