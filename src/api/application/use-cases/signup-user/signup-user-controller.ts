import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { signupUserSchema } from "../../schemas/signup-user-schema";
import { SignupUserUseCase } from "./signup-user-use-case";

export class SignupUserController extends BaseController {
  constructor(private readonly useCase: SignupUserUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = signupUserSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute(validation.data);
    if (!result.ok) {
      switch (result.error) {
        case "email_already_registered":
          return this.conflict(res, result.error, "This email is already registered");
        default:
          throw new Error(result.error);
      }
    }

    return this.created(res, result.value.toJSON());
  }
}
