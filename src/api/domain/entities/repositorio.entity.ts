import { randomUUID } from "node:crypto";

export type ProvedorScm = "github";

export type CreateRepositorioProps = {
  usuarioId: string;
  nomeCompleto: string;
};

export class Repositorio {
  private constructor(
    public readonly id: string,
    public readonly usuarioId: string,
    public readonly provedorScm: ProvedorScm,
    public readonly nomeCompleto: string,
    public readonly ativo: boolean,
    public readonly criadoEm: Date,
    public readonly atualizadoEm: Date,
  ) {}

  static create(props: CreateRepositorioProps): Repositorio {
    const now = new Date();
    return new Repositorio(
      randomUUID(),
      props.usuarioId,
      "github",
      props.nomeCompleto,
      true,
      now,
      now,
    );
  }

  static fromPersistence(props: {
    id: string;
    usuarioId: string;
    provedorScm: ProvedorScm;
    nomeCompleto: string;
    ativo: boolean;
    criadoEm: Date;
    atualizadoEm: Date;
  }): Repositorio {
    return new Repositorio(
      props.id,
      props.usuarioId,
      props.provedorScm,
      props.nomeCompleto,
      props.ativo,
      props.criadoEm,
      props.atualizadoEm,
    );
  }

  toJSON() {
    return {
      id: this.id,
      nomeCompleto: this.nomeCompleto,
      provedorScm: this.provedorScm,
      ativo: this.ativo,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }
}
