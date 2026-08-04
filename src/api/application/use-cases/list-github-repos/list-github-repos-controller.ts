import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { listGithubReposSchema } from "../../schemas/list-github-repos-schema";
import { ListGithubReposUseCase } from "./list-github-repos-use-case";

export class ListGithubReposController extends BaseController {
  constructor(private readonly useCase: ListGithubReposUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = listGithubReposSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute({
      userId: req.userId as string,
      pat: validation.data.pat,
    });

    if (!result.ok) {
      switch (result.error) {
        case "github_auth_failed":
          return this.unauthorized(res, result.error, "GitHub rejected the provided token");
        case "github_rate_limited":
          return this.tooMany(res, result.error, "GitHub rate limit exceeded, try again shortly");
        default:
          throw new Error(result.error);
      }
    }

    return this.ok(res, { repos: result.value });
  }
}
