import { randomUUID } from "node:crypto";

export type TurnSource = "agent" | "human" | "mixed";

export type CreateReviewTurnProps = {
  reviewRunId: string;
  index: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  errorReason?: string | null;
};

export class ReviewTurn {
  private constructor(
    public readonly id: string,
    public readonly reviewRunId: string,
    public readonly index: number,
    public readonly inputTokens: number,
    public readonly outputTokens: number,
    public readonly reasoningTokens: number,
    public readonly source: TurnSource,
    public readonly errorReason: string | null,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateReviewTurnProps): ReviewTurn {
    return new ReviewTurn(
      randomUUID(),
      props.reviewRunId,
      props.index,
      props.inputTokens,
      props.outputTokens,
      props.reasoningTokens,
      // Always "agent" in v1 — reserved for the future HITL extension
      // (RF-EXT-02/03, see backend-prds/00-shared-modelo-de-dados.md).
      "agent",
      props.errorReason ?? null,
      new Date(),
    );
  }

  static fromPersistence(props: {
    id: string;
    reviewRunId: string;
    index: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    source: TurnSource;
    errorReason: string | null;
    createdAt: Date;
  }): ReviewTurn {
    return new ReviewTurn(
      props.id,
      props.reviewRunId,
      props.index,
      props.inputTokens,
      props.outputTokens,
      props.reasoningTokens,
      props.source,
      props.errorReason,
      props.createdAt,
    );
  }

  toJSON() {
    return {
      index: this.index,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      reasoningTokens: this.reasoningTokens,
      source: this.source,
      errorReason: this.errorReason,
    };
  }
}
