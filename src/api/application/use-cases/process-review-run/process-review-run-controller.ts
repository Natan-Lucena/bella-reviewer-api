import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { processReviewRunSchema } from "../../schemas/process-review-run-schema";
import { ProcessReviewRunUseCase } from "./process-review-run-use-case";

export class ProcessReviewRunController extends BaseController {
  constructor(private readonly useCase: ProcessReviewRunUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = processReviewRunSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const reviewRunId = req.params.reviewRunId;
    if (!reviewRunId) {
      return this.notFound(res, "review_run_not_found", "Review run not found");
    }

    const result = await this.useCase.execute({
      reviewRunId,
      diff: validation.data.diff,
      prTitle: validation.data.prTitle,
      prDescription: validation.data.prDescription,
    });

    if (!result.ok) {
      return this.notFound(res, "review_run_not_found", "Review run not found");
    }

    // Both "completed" and "failed" are the expected outcome of a fully
    // processed request — a business-level failure (bad config, oversized
    // diff) isn't an HTTP error, so QStash doesn't keep retrying it forever.
    return this.ok(res, result.value);
  }
}
