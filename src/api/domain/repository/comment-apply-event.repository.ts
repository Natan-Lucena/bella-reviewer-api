import { CommentApplyEvent } from "../entities/comment-apply-event.entity";

export interface CommentApplyEventRepository {
  save(event: CommentApplyEvent): Promise<void>;
  findByCommentId(commentId: string): Promise<CommentApplyEvent[]>;
}
