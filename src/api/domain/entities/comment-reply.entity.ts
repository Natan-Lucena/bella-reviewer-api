import { Uuid } from "../../../shared/core/uuid";

export type CommentReplyStatus = "queued" | "processing" | "completed" | "failed";
// Classified by the LLM together with generating the response itself — starts
// null (not yet classified) and is only ever filled in once status becomes
// "completed". Never inferred by a separate heuristic.
export type CommentReplyCategory =
  | "fix"
  | "clarification"
  | "disagreement"
  | "acknowledgment"
  | "other";

export type CreateCommentReplyProps = {
  commentId: string;
  humanExternalId: string;
  humanBody: string;
  humanAuthor: string;
};

export class CommentReply {
  private constructor(
    public readonly id: Uuid,
    public readonly commentId: string,
    public readonly humanExternalId: string,
    public readonly humanBody: string,
    public readonly humanAuthor: string,
    public status: CommentReplyStatus,
    public category: CommentReplyCategory | null,
    public errorReason: string | null,
    public bellaBody: string | null,
    public bellaSuggestedCode: string | null,
    public bellaExternalId: string | null,
    public inputTokens: number,
    public outputTokens: number,
    public reasoningTokens: number,
    public estimatedCost: number | null,
    public readonly createdAt: Date,
    public completedAt: Date | null,
  ) {}

  static create(props: CreateCommentReplyProps): CommentReply {
    return new CommentReply(
      Uuid.random(),
      props.commentId,
      props.humanExternalId,
      props.humanBody,
      props.humanAuthor,
      "queued",
      null,
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      null,
      new Date(),
      null,
    );
  }

  static fromPersistence(props: {
    id: string;
    commentId: string;
    humanExternalId: string;
    humanBody: string;
    humanAuthor: string;
    status: CommentReplyStatus;
    category: CommentReplyCategory | null;
    errorReason: string | null;
    bellaBody: string | null;
    bellaSuggestedCode: string | null;
    bellaExternalId: string | null;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    estimatedCost: number | null;
    createdAt: Date;
    completedAt: Date | null;
  }): CommentReply {
    return new CommentReply(
      new Uuid(props.id),
      props.commentId,
      props.humanExternalId,
      props.humanBody,
      props.humanAuthor,
      props.status,
      props.category,
      props.errorReason,
      props.bellaBody,
      props.bellaSuggestedCode,
      props.bellaExternalId,
      props.inputTokens,
      props.outputTokens,
      props.reasoningTokens,
      props.estimatedCost,
      props.createdAt,
      props.completedAt,
    );
  }

  toJSON() {
    return {
      id: this.id.value,
      commentId: this.commentId,
      humanBody: this.humanBody,
      humanAuthor: this.humanAuthor,
      status: this.status,
      category: this.category,
      bellaBody: this.bellaBody,
      bellaSuggestedCode: this.bellaSuggestedCode,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
    };
  }
}
