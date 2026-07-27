import { Uuid } from "../../../shared/core/uuid";

export type CreateUserProps = {
  email: string;
  passwordHash: string;
};

export class User {
  private constructor(
    public readonly id: Uuid,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateUserProps): User {
    return new User(Uuid.random(), props.email, props.passwordHash, new Date());
  }

  static fromPersistence(props: {
    id: string;
    email: string;
    passwordHash: string;
    createdAt: Date;
  }): User {
    return new User(new Uuid(props.id), props.email, props.passwordHash, props.createdAt);
  }

  toJSON() {
    // passwordHash must never be exposed in any API response.
    return {
      id: this.id.value,
      email: this.email,
      createdAt: this.createdAt,
    };
  }
}
