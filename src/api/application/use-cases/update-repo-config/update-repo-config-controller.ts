import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { updateRepoConfigSchema } from "../../schemas/update-repo-config-schema";
import { UpdateRepoConfigUseCase } from "./update-repo-config-use-case";

export class UpdateRepoConfigController extends BaseController {
  constructor(private readonly useCase: UpdateRepoConfigUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = updateRepoConfigSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(
        res,
        "validation_error",
        validation.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    const result = await this.useCase.execute({
      userId: req.userId as string,
      repoId: req.params.id as string,
      ...validation.data,
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
