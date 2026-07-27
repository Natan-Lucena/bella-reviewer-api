import { Uuid } from "../../../shared/core/uuid";

export type ScmProvider = "github";

export type CreateRepoProps = {
  userId: string;
  fullName: string;
};

export class Repo {
  private constructor(
    public readonly id: Uuid,
    public readonly userId: string,
    public readonly scmProvider: ScmProvider,
    public readonly fullName: string,
    public readonly active: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(props: CreateRepoProps): Repo {
    const now = new Date();
    return new Repo(Uuid.random(), props.userId, "github", props.fullName, true, now, now);
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
      new Uuid(props.id),
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
      id: this.id.value,
      fullName: this.fullName,
      scmProvider: this.scmProvider,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
