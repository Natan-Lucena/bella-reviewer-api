import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { listReviewRunsSchema } from "../../schemas/list-review-runs-schema";
import { ListReviewRunsUseCase } from "./list-review-runs-use-case";

export class ListReviewRunsController extends BaseController {
  constructor(private readonly useCase: ListReviewRunsUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = listReviewRunsSchema.safeParse(req.query);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute({
      userId: req.userId as string,
      repoId: req.params.id as string,
      status: validation.data.status,
      limit: validation.data.limit,
      offset: validation.data.offset,
    });

    if (!result.ok) {
      return this.notFound(res, result.error, "Repository not found");
    }

    return this.ok(res, result.value);
  }
}
