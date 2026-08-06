import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { ingestWebhookSchema } from "../../schemas/ingest-webhook-schema";
import { IngestWebhookUseCase } from "./ingest-webhook-use-case";

export class IngestWebhookController extends BaseController {
  constructor(private readonly useCase: IngestWebhookUseCase) {
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
}
