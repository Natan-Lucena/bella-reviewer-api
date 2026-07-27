import { randomUUID } from "node:crypto";

export type ScmProvider = "github";

export type CreateRepoProps = {
  userId: string;
  fullName: string;
};

export class Repo {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly scmProvider: ScmProvider,
    public readonly fullName: string,
    public readonly active: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(props: CreateRepoProps): Repo {
    const now = new Date();
    return new Repo(randomUUID(), props.userId, "github", props.fullName, true, now, now);
  }

  static fromPersistence(props: {
    id: string;
    userId: string;
    scmProvider: ScmProvider;
    fullName: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Repo {
    return new Repo(
      props.id,
      props.userId,
      props.scmProvider,
      props.fullName,
      props.active,
      props.createdAt,
      props.updatedAt,
    );
  }

  toJSON() {
    return {
      id: this.id,
      fullName: this.fullName,
      scmProvider: this.scmProvider,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
