import { Request, RequestHandler, Response } from "express";

import { UserRepository } from "../../../domain/repository/user.repository";
import { getCurrentUser } from "./get-current-user";

export function getCurrentUserController(deps: { userRepository: UserRepository }): RequestHandler {
  return async (req: Request, res: Response) => {
    // req.userId is guaranteed to be set by auth-middleware, which runs
    // before this controller on every route that uses it.
    const result = await getCurrentUser(req.userId as string, deps);
    if (!result.ok) {
      res.status(401).json({ error: { code: result.error.code, message: result.error.message } });
      return;
    }
    res.status(200).json(result.value.toJSON());
  };
}
