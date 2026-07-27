import { Uuid } from "../../../shared/core/uuid";

export type Trigger = "action" | "webhook";
export type ReviewRunStatus = "queued" | "processing" | "completed" | "failed";

export type CreateReviewRunProps = {
  repoId: string;
  prNumber: number;
  commitSha: string;
  trigger: Trigger;
};

export class ReviewRun {
  private constructor(
    public readonly id: Uuid,
    public readonly repoId: string,
    public readonly prNumber: number,
    public readonly commitSha: string,
    public readonly trigger: Trigger,
    public status: ReviewRunStatus,
    public errorReason: string | null,
    public totalInputTokens: number,
    public totalOutputTokens: number,
    public totalReasoningTokens: number,
    public estimatedCost: number | null,
    public startedAt: Date | null,
    public completedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateReviewRunProps): ReviewRun {
    return new ReviewRun(
      Uuid.random(),
      props.repoId,
      props.prNumber,
      props.commitSha,
      props.trigger,
      "queued",
      null,
      0,
      0,
      0,
      null,
      null,
      null,
      new Date(),
    );
  }

  static fromPersistence(props: {
    id: string;
    repoId: string;
    prNumber: number;
    commitSha: string;
    trigger: Trigger;
    status: ReviewRunStatus;
    errorReason: string | null;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalReasoningTokens: number;
    estimatedCost: number | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }): ReviewRun {
    return new ReviewRun(
      new Uuid(props.id),
      props.repoId,
      props.prNumber,
      props.commitSha,
      props.trigger,
      props.status,
      props.errorReason,
      props.totalInputTokens,
      props.totalOutputTokens,
      props.totalReasoningTokens,
      props.estimatedCost,
      props.startedAt,
      props.completedAt,
      props.createdAt,
    );
  }

  toJSON() {
    return {
      id: this.id.value,
      prNumber: this.prNumber,
      commitSha: this.commitSha,
      trigger: this.trigger,
      status: this.status,
      errorReason: this.errorReason,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalReasoningTokens: this.totalReasoningTokens,
      estimatedCost: this.estimatedCost,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      createdAt: this.createdAt,
    };
  }
}
