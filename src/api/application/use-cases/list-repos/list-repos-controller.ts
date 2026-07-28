import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { ListReposUseCase } from "./list-repos-use-case";

export class ListReposController extends BaseController {
  constructor(private readonly useCase: ListReposUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const result = await this.useCase.execute({ userId: req.userId as string });
    if (!result.ok) {
      throw new Error("Unexpected error listing repos");
    }

    return this.ok(res, result.value);
  }
}
