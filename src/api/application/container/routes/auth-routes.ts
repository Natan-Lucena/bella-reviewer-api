import { Router } from "express";

import { UserRepository } from "../../../domain/repository/user.repository";
import { getCurrentUserController } from "../../use-cases/get-current-user/get-current-user-controller";
import { loginUserController } from "../../use-cases/login-user/login-user-controller";
import { signupUserController } from "../../use-cases/signup-user/signup-user-controller";
import { authMiddleware } from "../middlewares/auth-middleware";

export function createAuthRoutes(deps: { userRepository: UserRepository }): Router {
  const router = Router();

  router.post("/signup", signupUserController(deps));
  router.post("/login", loginUserController(deps));
  router.get("/me", authMiddleware, getCurrentUserController(deps));

  return router;
}
