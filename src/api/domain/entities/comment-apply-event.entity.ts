import { Uuid } from "../../../shared/core/uuid";
import { ApplyStatus } from "./comment.entity";

// pending is never a transition — it's only ever the initial value a Comment
// is created with (see Comment.create), not something reconciliation
// observes happening.
export type CommentApplyEventStatus = Exclude<ApplyStatus, "pending">;

export type CreateCommentApplyEventProps = {
  commentId: string;
  newStatus: CommentApplyEventStatus;
  commitSha: string | null;
  detectionMethod: string;
};

// An audit record — read-only once created, no transition method (an event
// that already happened doesn't change).
export class CommentApplyEvent {
  private constructor(
    public readonly id: Uuid,
    public readonly commentId: string,
    public readonly newStatus: CommentApplyEventStatus,
    public readonly commitSha: string | null,
    public readonly detectionMethod: string,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateCommentApplyEventProps): CommentApplyEvent {
    return new CommentApplyEvent(
      Uuid.random(),
      props.commentId,
      props.newStatus,
      props.commitSha,
      props.detectionMethod,
      new Date(),
    );
  }

  static fromPersistence(props: {
    id: string;
    commentId: string;
    newStatus: CommentApplyEventStatus;
    commitSha: string | null;
    detectionMethod: string;
    createdAt: Date;
  }): CommentApplyEvent {
    return new CommentApplyEvent(
      new Uuid(props.id),
      props.commentId,
      props.newStatus,
      props.commitSha,
      props.detectionMethod,
      props.createdAt,
    );
  }

  toJSON() {
    return {
      id: this.id.value,
      commentId: this.commentId,
      newStatus: this.newStatus,
      commitSha: this.commitSha,
      detectionMethod: this.detectionMethod,
      createdAt: this.createdAt,
    };
  }
}
