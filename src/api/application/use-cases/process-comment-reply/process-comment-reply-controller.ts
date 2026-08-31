import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { processCommentReplySchema } from "../../schemas/process-comment-reply-schema";
import { ProcessCommentReplyUseCase } from "./process-comment-reply-use-case";

export class ProcessCommentReplyController extends BaseController {
  constructor(private readonly useCase: ProcessCommentReplyUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    const validation = processCommentReplySchema.safeParse(req.body);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    const commentReplyId = req.params.commentReplyId;
    if (!commentReplyId) {
      return this.notFound(res, "comment_reply_not_found", "Comment reply not found");
    }

    const result = await this.useCase.execute({
      commentReplyId,
      prNumber: validation.data.prNumber,
      commitSha: validation.data.commitSha,
      prTitle: validation.data.prTitle,
      prDescription: validation.data.prDescription,
    });

    if (!result.ok) {
      switch (result.error) {
        case "comment_reply_not_found":
          return this.notFound(res, "comment_reply_not_found", "Comment reply not found");
        default:
          throw new Error(result.error);
      }
    }

    // Both "completed" and "failed" are the expected outcome of a fully
    // processed request — a business-level failure (bad config) isn't an
    // HTTP error, so the caller doesn't keep retrying it forever.
    return this.ok(res, result.value);
  }
}
