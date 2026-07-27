import { randomUUID } from "node:crypto";

export type Severidade = "baixa" | "media" | "alta" | "critica";
export type StatusComentario = "gerado" | "publicado" | "agregado_descartado" | "desatualizado";

export type CreateComentarioProps = {
  reviewRunId: string;
  reviewTurnId: string;
  arquivo: string;
  linha: number;
  categoria: string;
  severidade: Severidade;
  corpo: string;
};

export class Comentario {
  private constructor(
    public readonly id: string,
    public readonly reviewRunId: string,
    public readonly reviewTurnId: string,
    public readonly arquivo: string,
    public readonly linha: number,
    public readonly categoria: string,
    public readonly severidade: Severidade,
    public readonly corpo: string,
    public status: StatusComentario,
    public idExterno: string | null,
    public readonly criadoEm: Date,
  ) {}

  static create(props: CreateComentarioProps): Comentario {
    return new Comentario(
      randomUUID(),
      props.reviewRunId,
      props.reviewTurnId,
      props.arquivo,
      props.linha,
      props.categoria,
      props.severidade,
      props.corpo,
      "gerado",
      null,
      new Date(),
    );
  }

  static fromPersistence(props: {
    id: string;
    reviewRunId: string;
    reviewTurnId: string;
    arquivo: string;
    linha: number;
    categoria: string;
    severidade: Severidade;
    corpo: string;
    status: StatusComentario;
    idExterno: string | null;
    criadoEm: Date;
  }): Comentario {
    return new Comentario(
      props.id,
      props.reviewRunId,
      props.reviewTurnId,
      props.arquivo,
      props.linha,
      props.categoria,
      props.severidade,
      props.corpo,
      props.status,
      props.idExterno,
      props.criadoEm,
    );
  }

  toJSON() {
    return {
      id: this.id,
      reviewRunId: this.reviewRunId,
      arquivo: this.arquivo,
      linha: this.linha,
      categoria: this.categoria,
      severidade: this.severidade,
      corpo: this.corpo,
      status: this.status,
      idExterno: this.idExterno,
      criadoEm: this.criadoEm,
    };
  }
}
