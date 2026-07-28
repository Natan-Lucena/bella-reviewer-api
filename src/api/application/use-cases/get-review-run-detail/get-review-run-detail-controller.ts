import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { GetReviewRunDetailUseCase } from "./get-review-run-detail-use-case";

export class GetReviewRunDetailController extends BaseController {
  constructor(private readonly useCase: GetReviewRunDetailUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const result = await this.useCase.execute({
      userId: req.userId as string,
      repoId: req.params.id as string,
      runId: req.params.runId as string,
    });

    if (!result.ok) {
      switch (result.error) {
        case "repo_not_found":
          return this.notFound(res, result.error, "Repository not found");
        case "review_run_not_found":
          return this.notFound(res, result.error, "Review run not found");
        default:
          throw new Error(result.error);
      }
    }

    return this.ok(res, result.value);
  }
}
