import { Router } from "express";

import { UseCaseFactory } from "../factories/use-cases-factory";
import { ProcessReviewRunController } from "../../use-cases/process-review-run/process-review-run-controller";
import { internalProcessMiddleware } from "../middlewares/internal-process-middleware";

export class InternalRouter {
  public readonly router: Router;
  private readonly useCasesFactory = new UseCaseFactory();

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.post("/review-runs/:reviewRunId/process", internalProcessMiddleware, (req, res) =>
      new ProcessReviewRunController(this.useCasesFactory.makeProcessReviewRunUseCase()).execute(
        req,
        res,
      ),
    );
  }
}
