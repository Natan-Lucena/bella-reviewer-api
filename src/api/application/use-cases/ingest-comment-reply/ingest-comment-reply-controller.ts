import { Request, Response } from "express";

import { BaseController } from "../../../../shared/core/base-controller";
import { formatZodError } from "../../../../shared/core/format-zod-error";
import { ingestCommentReplyWebhookSchema } from "../../schemas/ingest-comment-reply-webhook-schema";
import { IngestCommentReplyUseCase } from "./ingest-comment-reply-use-case";

export class IngestCommentReplyController extends BaseController {
  constructor(private readonly useCase: IngestCommentReplyUseCase) {
    super();
  }

  protected async executeImpl(req: Request, res: Response): Promise<Response | void> {
    // req.body is the raw Buffer read by express.raw() (see webhook-router.ts)
    // — webhook-signature-middleware already verified it against the repo's
    // secret.
    let payload: unknown;
    try {
      payload = JSON.parse((req.body as Buffer).toString("utf8"));
    } catch {
      return this.clientError(res, "invalid_payload", "Malformed JSON body");
    }

    // "edited"/"deleted" (and any other action) never reach the use case —
    // ignored, not an error, same convention as an unrecognized event type
    // in webhook-router.ts's dispatch switch.
    const rawAction = (payload as { action?: unknown })?.action;
    if (rawAction !== "created") {
      return this.accepted(res, { ignored: true });
    }

    const validation = ingestCommentReplyWebhookSchema.safeParse(payload);
    if (!validation.success) {
      return this.clientError(res, "validation_error", formatZodError(validation.error));
    }

    // A top-level (non-reply) comment on the PR carries no in_reply_to_id —
    // this endpoint only cares about replies within a thread Bella started.
    const { comment, pull_request: pullRequest } = validation.data;
    if (comment.in_reply_to_id === undefined) {
      return this.accepted(res, { ignored: true });
    }

    const result = await this.useCase.execute({
      repoId: req.repoId!,
      commentId: comment.id,
      inReplyToId: comment.in_reply_to_id,
      humanBody: comment.body,
      humanAuthor: comment.user.login,
      prNumber: pullRequest.number,
      commitSha: pullRequest.head.sha,
      prTitle: pullRequest.title,
      prDescription: pullRequest.body,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }

    return this.ok(
      res,
      result.value.kind === "accepted"
        ? { accepted: true, commentReply: result.value.commentReply.toJSON() }
        : { ignored: true },
    );
  }
}
