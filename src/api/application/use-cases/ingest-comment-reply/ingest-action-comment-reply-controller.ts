import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { ingestActionCommentReplySchema } from "../../schemas/ingest-action-comment-reply-schema";
import { IngestCommentReplyUseCase } from "./ingest-comment-reply-use-case";

export class IngestActionCommentReplyController extends BaseController {
  constructor(private readonly useCase: IngestCommentReplyUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = ingestActionCommentReplySchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const result = await this.useCase.execute({
      // Set by actionTokenMiddleware, resolved from the BELLA_TOKEN — never
      // sent by the caller.
      repoId: req.repoId as string,
      prNumber: validation.data.prNumber,
      commitSha: validation.data.commitSha,
      commentId: validation.data.commentId,
      inReplyToId: validation.data.inReplyToId,
      humanBody: validation.data.humanBody,
      humanAuthor: validation.data.humanAuthor,
      prTitle: validation.data.prTitle,
      prDescription: validation.data.prDescription,
    });

    if (!result.ok) {
      throw new Error("Unexpected error ingesting comment reply");
    }

    if (result.value.kind === "ignored") {
      return this.ok(res, { kind: "ignored" });
    }

    return this.ok(res, { kind: "accepted", commentReply: result.value.commentReply.toJSON() });
  }
}
