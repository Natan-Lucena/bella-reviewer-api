import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { getCostStatsSchema } from "../../schemas/get-cost-stats-schema";
import { GetCostStatsUseCase } from "./get-cost-stats-use-case";

export class GetCostStatsController extends BaseController {
  constructor(private readonly useCase: GetCostStatsUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = getCostStatsSchema.safeParse(req.query);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute({
      userId: req.userId as string,
      repoId: req.params.id as string,
      period: validation.data.period,
    });

    if (!result.ok) {
      return this.notFound(res, result.error, "Repository not found");
    }

    return this.ok(res, result.value);
  }
}
