import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { GetCurrentUserUseCase } from "./get-current-user-use-case";

export class GetCurrentUserController extends BaseController {
  constructor(private readonly useCase: GetCurrentUserUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    // req.userId is guaranteed to be set by auth-middleware, which runs
    // before this controller on every route that uses it.
    const result = await this.useCase.execute(req.userId as string);
    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return this.unauthorized(res, result.error, "Invalid or expired session");
        default:
          throw new Error(result.error);
      }
    }
    return this.ok(res, result.value.toJSON());
  }
}
