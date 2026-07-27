import { Request, RequestHandler, Response } from "express";

import { UserRepository } from "../../../domain/repository/user.repository";
import { signupUserSchema } from "../../schemas/signup-user-schema";
import { signupUser } from "./signup-user";

export function signupUserController(deps: { userRepository: UserRepository }): RequestHandler {
  return async (req: Request, res: Response) => {
    const parsed = signupUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "validation_error",
          message: parsed.error.issues[0]?.message ?? "Invalid request body",
        },
      });
      return;
    }

    const result = await signupUser(parsed.data, deps);
    if (!result.ok) {
      const status = result.error.code === "email_already_registered" ? 409 : 400;
      res
        .status(status)
        .json({ error: { code: result.error.code, message: result.error.message } });
      return;
    }

    res.status(201).json(result.value.toJSON());
  };
}
