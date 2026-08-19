import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { updatePromptSchema } from "../../schemas/update-prompt-schema";
import { UpdatePromptUseCase } from "./update-prompt-use-case";

export class UpdatePromptController extends BaseController {
  constructor(private readonly useCase: UpdatePromptUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = updatePromptSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute({
      userId: req.userId as string,
      promptId: req.params.id as string,
      ...validation.data,
    });

    if (!result.ok) {
      switch (result.error) {
        case "prompt_not_found":
          return this.notFound(res, result.error, "Prompt not found");
        case "prompt_name_already_exists":
          return this.conflict(res, result.error, "A prompt with this name already exists");
        default:
          throw new Error(result.error);
      }
    }

    return this.ok(res, result.value.toJSON());
  }
}
