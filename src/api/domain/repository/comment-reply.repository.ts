import { CommentReply } from "../entities/comment-reply.entity";

export interface CommentReplyRepository {
  save(reply: CommentReply): Promise<void>;
  findById(id: string): Promise<CommentReply | null>;
  // Idempotency guard against webhook redelivery — see the schema comment on
  // CommentReply.humanExternalId.
  findByHumanExternalId(humanExternalId: string): Promise<CommentReply | null>;
  findByCommentId(commentId: string): Promise<CommentReply[]>;
  countByCommentId(commentId: string): Promise<number>;
}
