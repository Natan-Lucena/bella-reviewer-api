import { Request, Response } from "express";

import { logger } from "../../../../logger";
import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { prReviewThreadResolvedWebhookSchema } from "../../schemas/pr-review-thread-resolved-webhook-schema";
import { ReconcileThreadResolutionUseCase } from "./reconcile-thread-resolution-use-case";

export class ReconcileThreadResolutionController extends BaseController {
  constructor(private readonly useCase: ReconcileThreadResolutionUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    // req.body is the raw Buffer read by express.raw() (see webhook-router.ts)
    // — webhook-signature-middleware already verified it against the repo's
    // secret.
    let payload: unknown;
    try {
      payload = JSON.parse((req.body as Buffer).toString("utf8"));
    } catch {
      return this.clientError(res, "invalid_payload", "Malformed JSON body");
    }

    // Any action other than "resolved" (e.g. "unresolved") is a legitimate,
    // common event this endpoint simply has nothing to do with — ignored,
    // not an error, same convention as an unrecognized pull_request action.
    const rawAction = (payload as { action?: unknown })?.action;
    if (rawAction !== "resolved") {
      return this.ok(res, { ignored: true });
    }

    const validation = prReviewThreadResolvedWebhookSchema.safeParse(payload);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    // The schema's .min(1) already guarantees this at runtime — Zod just
    // doesn't narrow TypeScript's static array type for it.
    const originalComment = validation.data.thread.comments[0] as { id: number };

    // Best-effort, same spirit as every other reconciliation trigger — never
    // turns into a 500 for the webhook delivery.
    try {
      const result = await this.useCase.execute({
        repoId: req.repoId as string,
        externalId: String(originalComment.id),
        headCommitSha: validation.data.pull_request.head.sha,
      });
      if (!result.ok) {
        logger.warn("Thread resolution reconciliation failed", { reason: result.error });
      }
    } catch (error) {
      logger.warn("Thread resolution reconciliation failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return this.ok(res, { handled: true });
  }
}
