import { Uuid } from "../../../shared/core/uuid";

export type CreatePromptProps = {
  userId: string;
  name: string;
  content: string;
};

export type UpdatePromptProps = {
  name?: string;
  content?: string;
};

export class Prompt {
  private constructor(
    public readonly id: Uuid,
    public readonly userId: string,
    public readonly name: string,
    public readonly content: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(props: CreatePromptProps): Prompt {
    const now = new Date();
    return new Prompt(Uuid.random(), props.userId, props.name, props.content, now, now);
  }

  // Applies a partial patch (unset fields keep their current value) and
  // bumps updatedAt — same id/userId/createdAt.
  update(props: UpdatePromptProps): Prompt {
    return new Prompt(
      this.id,
      this.userId,
      props.name ?? this.name,
      props.content ?? this.content,
      this.createdAt,
      new Date(),
    );
  }

  static fromPersistence(props: {
    id: string;
    userId: string;
    name: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
  }): Prompt {
    return new Prompt(
      new Uuid(props.id),
      props.userId,
      props.name,
      props.content,
      props.createdAt,
      props.updatedAt,
    );
  }

  toJSON() {
    return {
      id: this.id.value,
      name: this.name,
      content: this.content,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
