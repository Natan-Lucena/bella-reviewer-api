import { Router } from "express";

import { UserRepositoryImpl } from "../../../infraestructure/UserRepositoryImpl";
import { createAuthRoutes } from "../routes/auth-routes";

export function makeAuthRoutes(): Router {
  const userRepository = new UserRepositoryImpl();
  return createAuthRoutes({ userRepository });
}
