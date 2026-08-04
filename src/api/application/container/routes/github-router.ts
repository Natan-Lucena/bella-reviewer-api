import { Router } from "express";

import { UseCaseFactory } from "../factories/use-cases-factory";
import { ListGithubReposController } from "../../use-cases/list-github-repos/list-github-repos-controller";
import { authMiddleware } from "../middlewares/auth-middleware";

// User-level GitHub operations that happen before a Repo exists yet — see
// repo-router.ts for the repo-scoped counterpart (install-action).
export class GithubRouter {
  public readonly router: Router;
  private readonly useCasesFactory = new UseCaseFactory();

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.post("/repos", authMiddleware, (req, res) =>
      new ListGithubReposController(this.useCasesFactory.makeListGithubReposUseCase()).execute(
        req,
        res,
      ),
    );
  }
}
