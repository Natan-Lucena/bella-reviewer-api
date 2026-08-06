import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { GenerateWebhookSecretUseCase } from "./generate-webhook-secret-use-case";

export class GenerateWebhookSecretController extends BaseController {
  constructor(private readonly useCase: GenerateWebhookSecretUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const result = await this.useCase.execute({
      userId: req.userId as string,
      repoId: req.params.id as string,
    });

    if (!result.ok) {
      switch (result.error) {
        case "repo_not_found":
          return this.notFound(res, result.error, "Repository not found");
        default:
          throw new Error(result.error);
      }
    }

    return this.ok(res, {
      type: "webhook_secret",
      secret: result.value.secret,
      webhookUrl: result.value.webhookUrl,
      warning:
        'This value cannot be retrieved again. Configure it on GitHub under Settings > Webhooks, along with the URL above, and make sure both the "Pull requests" and "Pull request review threads" events are checked (or choose "Send me everything") — the second one is required for the platform to detect when a suggestion is dismissed by resolving its thread.',
    });
  }
}
