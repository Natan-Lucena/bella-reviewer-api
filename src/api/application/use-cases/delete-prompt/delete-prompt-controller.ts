import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { DeletePromptUseCase } from "./delete-prompt-use-case";

export class DeletePromptController extends BaseController {
  constructor(private readonly useCase: DeletePromptUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const result = await this.useCase.execute({
      userId: req.userId as string,
      promptId: req.params.id as string,
    });

    if (!result.ok) {
      switch (result.error) {
        case "prompt_not_found":
          return this.notFound(res, result.error, "Prompt not found");
        default:
          throw new Error(result.error);
      }
    }

    return this.noContent(res);
  }
}
