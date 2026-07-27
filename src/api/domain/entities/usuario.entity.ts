import { randomUUID } from "node:crypto";

export type CreateUsuarioProps = {
  email: string;
  senhaHash: string;
};

export class Usuario {
  private constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly senhaHash: string,
    public readonly criadoEm: Date,
  ) {}

  static create(props: CreateUsuarioProps): Usuario {
    return new Usuario(randomUUID(), props.email, props.senhaHash, new Date());
  }

  static fromPersistence(props: {
    id: string;
    email: string;
    senhaHash: string;
    criadoEm: Date;
  }): Usuario {
    return new Usuario(props.id, props.email, props.senhaHash, props.criadoEm);
  }

  toJSON() {
    // senhaHash nunca deve ser exposto em nenhuma resposta de API — ver
    // backend-prds/02-auth-cadastro-login-sessao.md.
    return {
      id: this.id,
      email: this.email,
      criadoEm: this.criadoEm,
    };
  }
}
