import { randomUUID } from "node:crypto";

export type LlmProvider = "gemini";

export type CreateRepoConfigProps = {
  repoId: string;
  model: string;
  tokenLimit: number;
  temperature?: number;
  enabledCategories?: string[];
};

export class RepoConfig {
  private constructor(
    public readonly id: string,
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
      randomUUID(),
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
      props.id,
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
