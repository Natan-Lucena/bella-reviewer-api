import { Request, Response } from "express";

import { config } from "../../../../config";
import { BaseController } from "../../../../shared/core/base-controller";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from "../../../../shared/infra/auth/session-token";
import { loginUserSchema } from "../../schemas/login-user-schema";
import { LoginUserUseCase } from "./login-user-use-case";

export class LoginUserController extends BaseController {
  constructor(private readonly useCase: LoginUserUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = loginUserSchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(
        res,
        "validation_error",
        validation.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    const result = await this.useCase.execute(validation.data);
    if (!result.ok) {
      switch (result.error) {
        case "invalid_credentials":
          return this.unauthorized(res, result.error, "Invalid email or password");
        default:
          throw new Error(result.error);
      }
    }

    // SameSite=None+Secure is what production needs (frontend and backend
    // are different origins on Vercel — refinamento.md). Both require
    // HTTPS, which local dev over plain http doesn't have, so relax to
    // Lax/non-secure outside production; that's still correct for
    // same-origin tools (curl, Postman, tests) either way.
    res.cookie(SESSION_COOKIE_NAME, result.value.token, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: config.NODE_ENV === "production" ? "none" : "lax",
      maxAge: SESSION_MAX_AGE_MS,
      path: "/",
    });

    return this.ok(res, { id: result.value.id, email: result.value.email });
  }
}
