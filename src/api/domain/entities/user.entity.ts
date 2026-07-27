import { randomUUID } from "node:crypto";

export type CreateUserProps = {
  email: string;
  passwordHash: string;
};

export class User {
  private constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateUserProps): User {
    return new User(randomUUID(), props.email, props.passwordHash, new Date());
  }

  static fromPersistence(props: {
    id: string;
    email: string;
    passwordHash: string;
    createdAt: Date;
  }): User {
    return new User(props.id, props.email, props.passwordHash, props.createdAt);
  }

  toJSON() {
    // passwordHash must never be exposed in any API response — see
    // backend-prds/02-auth-cadastro-login-sessao.md.
    return {
      id: this.id,
      email: this.email,
      createdAt: this.createdAt,
    };
  }
}
