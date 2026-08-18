import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { setLlmCredentialSchema } from "../../schemas/set-llm-credential-schema";
import { SetLlmCredentialUseCase } from "./set-llm-credential-use-case";

export class SetLlmCredentialController extends BaseController {
  constructor(private readonly useCase: SetLlmCredentialUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = setLlmCredentialSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute({
      userId: req.userId as string,
      repoId: req.params.id as string,
      provider: validation.data.provider,
      apiKey: validation.data.apiKey,
      model: validation.data.model,
    });

    if (!result.ok) {
      switch (result.error) {
        case "repo_not_found":
          return this.notFound(res, result.error, "Repository not found");
        default:
          throw new Error(result.error);
      }
    }

    return this.ok(res, result.value.toJSON());
  }
}
