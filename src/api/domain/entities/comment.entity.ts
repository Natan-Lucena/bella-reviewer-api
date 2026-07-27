import { Uuid } from "../../../shared/core/uuid";

export type Severity = "low" | "medium" | "high" | "critical";
export type CommentStatus = "generated" | "published" | "discarded" | "outdated";

export type CreateCommentProps = {
  reviewRunId: string;
  reviewTurnId: string;
  file: string;
  line: number;
  category: string;
  severity: Severity;
  body: string;
};

export class Comment {
  private constructor(
    public readonly id: Uuid,
    public readonly reviewRunId: string,
    public readonly reviewTurnId: string,
    public readonly file: string,
    public readonly line: number,
    public readonly category: string,
    public readonly severity: Severity,
    public readonly body: string,
    public status: CommentStatus,
    public externalId: string | null,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateCommentProps): Comment {
    return new Comment(
      Uuid.random(),
      props.reviewRunId,
      props.reviewTurnId,
      props.file,
      props.line,
      props.category,
      props.severity,
      props.body,
      "generated",
      null,
      new Date(),
    );
  }

  static fromPersistence(props: {
    id: string;
    reviewRunId: string;
    reviewTurnId: string;
    file: string;
    line: number;
    category: string;
    severity: Severity;
    body: string;
    status: CommentStatus;
    externalId: string | null;
    createdAt: Date;
  }): Comment {
    return new Comment(
      new Uuid(props.id),
      props.reviewRunId,
      props.reviewTurnId,
      props.file,
      props.line,
      props.category,
      props.severity,
      props.body,
      props.status,
      props.externalId,
      props.createdAt,
    );
  }

  toJSON() {
    return {
      id: this.id.value,
      reviewRunId: this.reviewRunId,
      file: this.file,
      line: this.line,
      category: this.category,
      severity: this.severity,
      body: this.body,
      status: this.status,
      externalId: this.externalId,
      createdAt: this.createdAt,
    };
  }
}
