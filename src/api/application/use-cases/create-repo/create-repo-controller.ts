import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { createRepoSchema } from "../../schemas/create-repo-schema";
import { CreateRepoUseCase } from "./create-repo-use-case";

export class CreateRepoController extends BaseController {
  constructor(private readonly useCase: CreateRepoUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = createRepoSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(
        res,
        "validation_error",
        validation.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    // req.userId is guaranteed by auth-middleware, mounted before this
    // controller on every /repos route.
    const result = await this.useCase.execute({
      userId: req.userId as string,
      fullName: validation.data.fullName,
    });

    if (!result.ok) {
      throw new Error("Unexpected error creating repository");
    }

    return this.created(res, {
      ...result.value.repo.toJSON(),
      config: result.value.config.toJSON(),
    });
  }
}
