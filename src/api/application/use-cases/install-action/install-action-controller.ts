import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { installActionSchema } from "../../schemas/install-action-schema";
import { InstallActionUseCase } from "./install-action-use-case";

export class InstallActionController extends BaseController {
  constructor(private readonly useCase: InstallActionUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = installActionSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute({
      userId: req.userId as string,
      repoId: req.params.id as string,
      pat: validation.data.pat,
    });

    if (!result.ok) {
      switch (result.error) {
        case "repo_not_found":
          return this.notFound(res, result.error, "Repository not found");
        case "github_insufficient_scope":
          return this.forbidden(
            res,
            result.error,
            "The provided token doesn't have permission to open a pull request on this repository",
          );
        case "github_auth_failed":
          return this.unauthorized(res, result.error, "GitHub rejected the provided token");
        default:
          throw new Error(result.error);
      }
    }

    return this.ok(res, result.value);
  }
}
