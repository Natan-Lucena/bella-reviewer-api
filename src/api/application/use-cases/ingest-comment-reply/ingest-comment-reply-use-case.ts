import { config } from "../../../../config";
import { Result, success } from "../../../../shared/core/result";
import { CommentReply } from "../../../domain/entities/comment-reply.entity";
import { QueuePort } from "../../../domain/ports/queue.port";
import { CommentReplyRepository } from "../../../domain/repository/comment-reply.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";

// Arbitrary but deliberate: a thread this long has probably left "quick
// clarification" territory, and without a cap a runaway tool (or a chatty
// human) could generate unbounded LLM cost on one thread. No "limit
// reached" reply is ever published — silence is intentional, to avoid yet
// another notification on an already-long thread.
const MAX_REPLIES_PER_THREAD = 5;

export type IngestCommentReplyParams = {
  repoId: string;
  commentId: number;
  inReplyToId: number;
  humanBody: string;
  humanAuthor?: string;
  prNumber: number;
  commitSha: string;
  prTitle: string;
  prDescription: string | null;
};

export type IngestCommentReplyResult =
  | { kind: "ignored" }
  | { kind: "accepted"; commentReply: CommentReply };

export type IngestCommentReplyError = never;

export class IngestCommentReplyUseCase {
  constructor(
    private readonly commentRepository: CommentRepository,
    private readonly commentReplyRepository: CommentReplyRepository,
    private readonly queue: QueuePort,
  ) {}

  async execute(
    params: IngestCommentReplyParams,
  ): Promise<Result<IngestCommentReplyResult, IngestCommentReplyError>> {
    // Idempotency against webhook redelivery. This also doubles as loop
    // prevention: Bella never creates a CommentReply row whose
    // humanExternalId is the id of a reply she is about to publish herself,
    // so if this id has never been recorded as a humanExternalId before, it
    // is logically impossible for it to be something Bella herself just
    // posted — no author-based check is needed (and none is possible, since
    // Bella has no separate bot identity).
    const alreadyProcessed = await this.commentReplyRepository.findByHumanExternalId(
      String(params.commentId),
    );
    if (alreadyProcessed) {
      return success({ kind: "ignored" });
    }

    // The only reliable signal that this thread started with a Bella
    // comment: does a Comment of ours own the id this reply points at?
    const originalComment = await this.commentRepository.findByExternalId(
      String(params.inReplyToId),
    );
    if (!originalComment) {
      return success({ kind: "ignored" });
    }

    const existingReplyCount = await this.commentReplyRepository.countByCommentId(
      originalComment.id.value,
    );
    if (existingReplyCount >= MAX_REPLIES_PER_THREAD) {
      return success({ kind: "ignored" });
    }

    const commentReply = CommentReply.create({
      commentId: originalComment.id.value,
      humanExternalId: String(params.commentId),
      humanBody: params.humanBody,
      humanAuthor: params.humanAuthor ?? "",
    });
    await this.commentReplyRepository.save(commentReply);

    await this.queue.publish({
      url: `${config.BACKEND_PUBLIC_URL}/internal/comment-replies/${commentReply.id.value}/process`,
      body: {
        prNumber: params.prNumber,
        commitSha: params.commitSha,
        prTitle: params.prTitle,
        prDescription: params.prDescription,
      },
      headers: { Authorization: `Bearer ${config.INTERNAL_PROCESS_API_KEY}` },
    });

    return success({ kind: "accepted", commentReply });
  }
}
