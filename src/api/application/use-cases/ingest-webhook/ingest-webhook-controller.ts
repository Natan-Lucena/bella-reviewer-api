import { Request, Response } from "express";

import { logger } from "../../../../logger";
import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { ingestWebhookSchema } from "../../schemas/ingest-webhook-schema";
import { prClosedWebhookSchema } from "../../schemas/pr-closed-webhook-schema";
import { FinalizeSuggestionReconciliationUseCase } from "../finalize-suggestion-reconciliation/finalize-suggestion-reconciliation-use-case";
import { IngestWebhookUseCase } from "./ingest-webhook-use-case";

export class IngestWebhookController extends BaseController {
  constructor(
    private readonly useCase: IngestWebhookUseCase,
    private readonly finalizeSuggestionReconciliationUseCase: FinalizeSuggestionReconciliationUseCase,
  ) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    // req.body is the raw Buffer read by express.raw() (see webhook-router.ts)
    // — webhook-signature-middleware already verified it against the repo's
    // secret; parsing it again here is what turns it into a usable payload.
    let payload: unknown;
    try {
      payload = JSON.parse((req.body as Buffer).toString("utf8"));
    } catch {
      return this.clientError(res, "invalid_payload", "Malformed JSON body");
    }

    // "closed" is handled entirely differently (no ReviewRun, just a
    // best-effort reconciliation finalization) — checked before the main
    // schema so it never gets silently swallowed as an "ignored" action by
    // IngestWebhookUseCase.
    const rawAction = (payload as { action?: unknown })?.action;
    if (rawAction === "closed") {
      return this.handleClosed(req, res, payload);
    }

    const validation = ingestWebhookSchema.safeParse(payload);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute({
      // Set by webhook-signature-middleware, resolved from
      // repository.full_name — never trusted blindly from the body twice.
      repoId: req.repoId as string,
      action: validation.data.action,
      prNumber: validation.data.pull_request.number,
      commitSha: validation.data.pull_request.head.sha,
      prTitle: validation.data.pull_request.title,
      prDescription: validation.data.pull_request.body ?? undefined,
      previousCommitSha: validation.data.before,
    });

    if (!result.ok) {
      throw new Error("Unexpected error ingesting webhook event");
    }

    if (result.value.kind === "ignored") {
      return this.ok(res, { ignored: true });
    }

    const body = {
      id: result.value.reviewRun.id.value,
      status: result.value.reviewRun.status,
      commitSha: result.value.reviewRun.commitSha,
    };

    return result.value.isNew ? this.accepted(res, body) : this.ok(res, body);
  }

  private async handleClosed(
    req: Request,
    res: Response,
    payload: unknown,
  ): Promise<Response | void> {
    const validation = prClosedWebhookSchema.safeParse(payload);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    // Best-effort, same spirit as the reconciliation triggered from
    // ingest-webhook-use-case.ts — closing a PR has no ReviewRun to fail,
    // this finalization is the only effect of this event, but it should
    // never turn into a 500 for the webhook delivery.
    try {
      const result = await this.finalizeSuggestionReconciliationUseCase.execute({
        repoId: req.repoId as string,
        prNumber: validation.data.pull_request.number,
        finalCommitSha: validation.data.pull_request.head.sha,
      });
      if (!result.ok) {
        logger.warn("Suggestion reconciliation finalization failed", { reason: result.error });
      }
    } catch (error) {
      logger.warn("Suggestion reconciliation finalization failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return this.ok(res, { finalized: true });
  }
}
