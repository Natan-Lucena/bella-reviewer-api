import { Uuid } from "../../../shared/core/uuid";

export type Severity = "low" | "medium" | "high" | "critical";
export type CommentStatus = "generated" | "published" | "discarded" | "outdated";
export type CommentKind = "actionable" | "observation";
export type ApplyStatus =
  "pending" | "applied_button" | "applied_manual" | "not_applied" | "superseded" | "dismissed";

export type CreateCommentProps = {
  reviewRunId: string;
  reviewTurnId: string;
  file: string;
  line: number;
  category: string;
  severity: Severity;
  body: string;
  kind: CommentKind;
  // Required when kind is "actionable" — validated below rather than at the
  // type level, so the error is a clear domain message instead of a type
  // error the caller has to interpret.
  suggestedCode?: string | null;
  // The diff line immediately before/after `line`, when one exists in the
  // same hunk — used by reconciliation to relocate the suggestion if the
  // file shifts before the next push. Null when unavailable (edge of
  // file/hunk); reconciliation falls back to a direct line read in that case.
  contextBefore?: string | null;
  contextAfter?: string | null;
};

export type MarkApplyStatusProps = {
  commitSha: string | null;
  detectionMethod: string;
};

const APPLIED_STATUSES: ApplyStatus[] = ["applied_button", "applied_manual"];

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
    public readonly kind: CommentKind,
    public readonly suggestedCode: string | null,
    public readonly contextBefore: string | null,
    public readonly contextAfter: string | null,
    public readonly applyStatus: ApplyStatus | null,
    public readonly appliedAt: Date | null,
    public readonly appliedAtCommit: string | null,
    public readonly detectionMethod: string | null,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateCommentProps): Comment {
    if (props.kind === "actionable" && !props.suggestedCode) {
      throw new Error("An actionable comment requires suggestedCode");
    }

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
      props.kind,
      props.kind === "actionable" ? (props.suggestedCode as string) : null,
      props.contextBefore ?? null,
      props.contextAfter ?? null,
      props.kind === "actionable" ? "pending" : null,
      null,
      null,
      null,
      new Date(),
    );
  }

  // The only way applyStatus/appliedAt/appliedAtCommit/detectionMethod ever
  // change after creation — returns a new instance (same pattern as
  // Credential.rotateSecret) rather than mutating in place, so no caller
  // outside this entity can set applyStatus directly.
  markApplyStatus(status: ApplyStatus, props: MarkApplyStatusProps): Comment {
    const appliedAt = APPLIED_STATUSES.includes(status) ? new Date() : this.appliedAt;

    return new Comment(
      this.id,
      this.reviewRunId,
      this.reviewTurnId,
      this.file,
      this.line,
      this.category,
      this.severity,
      this.body,
      this.status,
      this.externalId,
      this.kind,
      this.suggestedCode,
      this.contextBefore,
      this.contextAfter,
      status,
      appliedAt,
      props.commitSha,
      props.detectionMethod,
      this.createdAt,
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
    kind: CommentKind;
    suggestedCode: string | null;
    contextBefore: string | null;
    contextAfter: string | null;
    applyStatus: ApplyStatus | null;
    appliedAt: Date | null;
    appliedAtCommit: string | null;
    detectionMethod: string | null;
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
      props.kind,
      props.suggestedCode,
      props.contextBefore,
      props.contextAfter,
      props.applyStatus,
      props.appliedAt,
      props.appliedAtCommit,
      props.detectionMethod,
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
      kind: this.kind,
      suggestedCode: this.suggestedCode,
      applyStatus: this.applyStatus,
      appliedAt: this.appliedAt,
      appliedAtCommit: this.appliedAtCommit,
      createdAt: this.createdAt,
    };
  }
}
