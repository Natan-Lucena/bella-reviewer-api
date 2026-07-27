import { Request, RequestHandler, Response } from "express";

import { config } from "../../../../config";
import { UserRepository } from "../../../domain/repository/user.repository";
import { loginUserSchema } from "../../schemas/login-user-schema";
import { loginUser } from "./login-user";

export const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — matches session-token.ts EXPIRES_IN

export function loginUserController(deps: { userRepository: UserRepository }): RequestHandler {
  return async (req: Request, res: Response) => {
    const parsed = loginUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "validation_error",
          message: parsed.error.issues[0]?.message ?? "Invalid request body",
        },
      });
      return;
    }

    const result = await loginUser(parsed.data, deps);
    if (!result.ok) {
      res.status(401).json({ error: { code: result.error.code, message: result.error.message } });
      return;
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

    res.status(200).json({ id: result.value.id, email: result.value.email });
  };
}
