import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { ingestActionSchema } from "../../schemas/ingest-action-schema";
import { IngestActionUseCase } from "./ingest-action-use-case";

export class IngestActionController extends BaseController {
  constructor(private readonly useCase: IngestActionUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = ingestActionSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute({
      // Set by action-token-middleware, resolved from the BELLA_TOKEN —
      // never sent by the caller.
      repoId: req.repoId as string,
      prNumber: validation.data.prNumber,
      commitSha: validation.data.commitSha,
      diff: validation.data.diff,
      prTitle: validation.data.prTitle,
      prDescription: validation.data.prDescription,
      previousCommitSha: validation.data.previousCommitSha,
    });

    if (!result.ok) {
      throw new Error("Unexpected error ingesting review run");
    }

    const body = {
      id: result.value.reviewRun.id.value,
      status: result.value.reviewRun.status,
      commitSha: result.value.reviewRun.commitSha,
    };

    return result.value.isNew ? this.accepted(res, body) : this.ok(res, body);
  }
}
