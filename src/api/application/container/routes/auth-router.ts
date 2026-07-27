import { Router } from "express";

import { UseCaseFactory } from "../factories/use-cases-factory";
import { GetCurrentUserController } from "../../use-cases/get-current-user/get-current-user-controller";
import { LoginUserController } from "../../use-cases/login-user/login-user-controller";
import { SignupUserController } from "../../use-cases/signup-user/signup-user-controller";
import { authMiddleware } from "../middlewares/auth-middleware";

export class AuthRouter {
  public readonly router: Router;
  private readonly useCasesFactory = new UseCaseFactory();

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.post("/signup", (req, res) =>
      new SignupUserController(this.useCasesFactory.makeSignupUserUseCase()).execute(req, res),
    );

    this.router.post("/login", (req, res) =>
      new LoginUserController(this.useCasesFactory.makeLoginUserUseCase()).execute(req, res),
    );

    this.router.get("/me", authMiddleware, (req, res) =>
      new GetCurrentUserController(this.useCasesFactory.makeGetCurrentUserUseCase()).execute(
        req,
        res,
      ),
    );
  }
}
