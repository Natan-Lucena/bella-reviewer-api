import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { GenerateActionTokenUseCase } from "./generate-action-token-use-case";

export class GenerateActionTokenController extends BaseController {
  constructor(private readonly useCase: GenerateActionTokenUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const result = await this.useCase.execute({
      userId: req.userId as string,
      repoId: req.params.id as string,
    });

    if (!result.ok) {
      switch (result.error) {
        case "repo_not_found":
          return this.notFound(res, result.error, "Repository not found");
        default:
          throw new Error(result.error);
      }
    }

    return this.ok(res, {
      type: "action_token",
      token: result.value.token,
      warning:
        "This value cannot be retrieved again. Save it as the BELLA_TOKEN secret in your GitHub Actions workflow.",
    });
  }
}
