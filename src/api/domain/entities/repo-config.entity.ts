import { Uuid } from "../../../shared/core/uuid";

export type LlmProvider = "gemini";

export type CreateRepoConfigProps = {
  repoId: string;
  model: string;
  tokenLimit: number;
  temperature?: number;
  enabledCategories?: string[];
};

export type UpdateRepoConfigProps = {
  model?: string;
  tokenLimit?: number;
  temperature?: number;
  enabledCategories?: string[];
};

export class RepoConfig {
  private constructor(
    public readonly id: Uuid,
    public readonly repoId: string,
    public readonly llmProvider: LlmProvider,
    public readonly model: string,
    public readonly tokenLimit: number,
    public readonly temperature: number,
    public readonly enabledCategories: string[],
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(props: CreateRepoConfigProps): RepoConfig {
    const now = new Date();
    return new RepoConfig(
      Uuid.random(),
      props.repoId,
      "gemini",
      props.model,
      props.tokenLimit,
      props.temperature ?? 0.2,
      props.enabledCategories ?? [],
      now,
      now,
    );
  }

  // Applies a partial patch (unset fields keep their current value) and
  // bumps updatedAt — same id/repoId/llmProvider/createdAt.
  update(props: UpdateRepoConfigProps): RepoConfig {
    return new RepoConfig(
      this.id,
      this.repoId,
      this.llmProvider,
      props.model ?? this.model,
      props.tokenLimit ?? this.tokenLimit,
      props.temperature ?? this.temperature,
      props.enabledCategories ?? this.enabledCategories,
      this.createdAt,
      new Date(),
    );
  }

  static fromPersistence(props: {
    id: string;
    repoId: string;
    llmProvider: LlmProvider;
    model: string;
    tokenLimit: number;
    temperature: number;
    enabledCategories: string[];
    createdAt: Date;
    updatedAt: Date;
  }): RepoConfig {
    return new RepoConfig(
      new Uuid(props.id),
      props.repoId,
      props.llmProvider,
      props.model,
      props.tokenLimit,
      props.temperature,
      props.enabledCategories,
      props.createdAt,
      props.updatedAt,
    );
  }

  toJSON() {
    return {
      llmProvider: this.llmProvider,
      model: this.model,
      tokenLimit: this.tokenLimit,
      temperature: this.temperature,
      enabledCategories: this.enabledCategories,
    };
  }
}
