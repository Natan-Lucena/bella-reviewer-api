import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { ListPromptsUseCase } from "./list-prompts-use-case";

export class ListPromptsController extends BaseController {
  constructor(private readonly useCase: ListPromptsUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const result = await this.useCase.execute({ userId: req.userId as string });
    if (!result.ok) {
      throw new Error("Unexpected error listing prompts");
    }

    return this.ok(res, { prompts: result.value.prompts.map((prompt) => prompt.toJSON()) });
  }
}
