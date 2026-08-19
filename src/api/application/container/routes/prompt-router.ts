import { Router } from "express";

import { UseCaseFactory } from "../factories/use-cases-factory";
import { CreatePromptController } from "../../use-cases/create-prompt/create-prompt-controller";
import { DeletePromptController } from "../../use-cases/delete-prompt/delete-prompt-controller";
import { ListPromptsController } from "../../use-cases/list-prompts/list-prompts-controller";
import { UpdatePromptController } from "../../use-cases/update-prompt/update-prompt-controller";
import { authMiddleware } from "../middlewares/auth-middleware";

export class PromptRouter {
  public readonly router: Router;
  private readonly useCasesFactory = new UseCaseFactory();

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.post("/", authMiddleware, (req, res) =>
      new CreatePromptController(this.useCasesFactory.makeCreatePromptUseCase()).execute(req, res),
    );

    this.router.get("/", authMiddleware, (req, res) =>
      new ListPromptsController(this.useCasesFactory.makeListPromptsUseCase()).execute(req, res),
    );

    this.router.patch("/:id", authMiddleware, (req, res) =>
      new UpdatePromptController(this.useCasesFactory.makeUpdatePromptUseCase()).execute(req, res),
    );

    this.router.delete("/:id", authMiddleware, (req, res) =>
      new DeletePromptController(this.useCasesFactory.makeDeletePromptUseCase()).execute(req, res),
    );
  }
}
