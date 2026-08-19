import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { createPromptSchema } from "../../schemas/create-prompt-schema";
import { CreatePromptUseCase } from "./create-prompt-use-case";

export class CreatePromptController extends BaseController {
  constructor(private readonly useCase: CreatePromptUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = createPromptSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute({
      userId: req.userId as string,
      ...validation.data,
    });

    if (!result.ok) {
      switch (result.error) {
        case "prompt_name_already_exists":
          return this.conflict(res, result.error, "A prompt with this name already exists");
        default:
          throw new Error(result.error);
      }
    }

    return this.created(res, result.value.toJSON());
  }
}
