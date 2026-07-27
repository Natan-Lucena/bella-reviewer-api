import { randomUUID } from "node:crypto";

export type OrigemTurno = "agente" | "humano" | "misto";

export type CreateReviewTurnProps = {
  reviewRunId: string;
  indice: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  erroMotivo?: string | null;
};

export class ReviewTurn {
  private constructor(
    public readonly id: string,
    public readonly reviewRunId: string,
    public readonly indice: number,
    public readonly tokensInput: number,
    public readonly tokensOutput: number,
    public readonly tokensReasoning: number,
    public readonly origem: OrigemTurno,
    public readonly erroMotivo: string | null,
    public readonly criadoEm: Date,
  ) {}

  static create(props: CreateReviewTurnProps): ReviewTurn {
    return new ReviewTurn(
      randomUUID(),
      props.reviewRunId,
      props.indice,
      props.tokensInput,
      props.tokensOutput,
      props.tokensReasoning,
      // Sempre "agente" na v1 — reservado para extensão HITL futura
      // (RF-EXT-02/03, ver backend-prds/00-shared-modelo-de-dados.md).
      "agente",
      props.erroMotivo ?? null,
      new Date(),
    );
  }

  static fromPersistence(props: {
    id: string;
    reviewRunId: string;
    indice: number;
    tokensInput: number;
    tokensOutput: number;
    tokensReasoning: number;
    origem: OrigemTurno;
    erroMotivo: string | null;
    criadoEm: Date;
  }): ReviewTurn {
    return new ReviewTurn(
      props.id,
      props.reviewRunId,
      props.indice,
      props.tokensInput,
      props.tokensOutput,
      props.tokensReasoning,
      props.origem,
      props.erroMotivo,
      props.criadoEm,
    );
  }

  toJSON() {
    return {
      indice: this.indice,
      tokensInput: this.tokensInput,
      tokensOutput: this.tokensOutput,
      tokensReasoning: this.tokensReasoning,
      origem: this.origem,
      erroMotivo: this.erroMotivo,
    };
  }
}
