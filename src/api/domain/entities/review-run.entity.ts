import { randomUUID } from "node:crypto";

export type Gatilho = "action" | "webhook";
export type StatusReviewRun = "enfileirada" | "em_processamento" | "concluida" | "erro";

export type CreateReviewRunProps = {
  repositorioId: string;
  prNumero: number;
  commitSha: string;
  gatilho: Gatilho;
};

export class ReviewRun {
  private constructor(
    public readonly id: string,
    public readonly repositorioId: string,
    public readonly prNumero: number,
    public readonly commitSha: string,
    public readonly gatilho: Gatilho,
    public status: StatusReviewRun,
    public erroMotivo: string | null,
    public tokensInputTotal: number,
    public tokensOutputTotal: number,
    public tokensReasoningTotal: number,
    public custoEstimado: number | null,
    public iniciadoEm: Date | null,
    public concluidoEm: Date | null,
    public readonly criadoEm: Date,
  ) {}

  static create(props: CreateReviewRunProps): ReviewRun {
    return new ReviewRun(
      randomUUID(),
      props.repositorioId,
      props.prNumero,
      props.commitSha,
      props.gatilho,
      "enfileirada",
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
    repositorioId: string;
    prNumero: number;
    commitSha: string;
    gatilho: Gatilho;
    status: StatusReviewRun;
    erroMotivo: string | null;
    tokensInputTotal: number;
    tokensOutputTotal: number;
    tokensReasoningTotal: number;
    custoEstimado: number | null;
    iniciadoEm: Date | null;
    concluidoEm: Date | null;
    criadoEm: Date;
  }): ReviewRun {
    return new ReviewRun(
      props.id,
      props.repositorioId,
      props.prNumero,
      props.commitSha,
      props.gatilho,
      props.status,
      props.erroMotivo,
      props.tokensInputTotal,
      props.tokensOutputTotal,
      props.tokensReasoningTotal,
      props.custoEstimado,
      props.iniciadoEm,
      props.concluidoEm,
      props.criadoEm,
    );
  }

  toJSON() {
    return {
      id: this.id,
      prNumero: this.prNumero,
      commitSha: this.commitSha,
      gatilho: this.gatilho,
      status: this.status,
      erroMotivo: this.erroMotivo,
      tokensInputTotal: this.tokensInputTotal,
      tokensOutputTotal: this.tokensOutputTotal,
      tokensReasoningTotal: this.tokensReasoningTotal,
      custoEstimado: this.custoEstimado,
      iniciadoEm: this.iniciadoEm,
      concluidoEm: this.concluidoEm,
      criadoEm: this.criadoEm,
    };
  }
}
