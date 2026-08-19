import { Uuid } from "../../../shared/core/uuid";

export type LlmProvider = "gemini" | "claude" | "openai";

export type CreateRepoConfigProps = {
  repoId: string;
  llmProvider: LlmProvider;
  model: string;
  tokenLimit: number;
  temperature?: number;
  enabledCategories?: string[];
};

export type UpdateRepoConfigProps = {
  // Only ever passed from SetLlmCredentialUseCase (configuring a new LLM
  // credential is what changes the active provider) — never from
  // UpdateRepoConfigUseCase/PATCH /repos/:id/config.
  llmProvider?: LlmProvider;
  model?: string;
  tokenLimit?: number;
  temperature?: number;
  enabledCategories?: string[];
  // Three-state field: omitted (leave selection untouched), null (clear back
  // to the default guidance), or a string (select a prompt) — see the "in"
  // check in update() below. `??` alone can't express this because `null` is
  // a valid, intentional value here, not "absent".
  promptId?: string | null;
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
    public readonly promptId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(props: CreateRepoConfigProps): RepoConfig {
    const now = new Date();
    return new RepoConfig(
      Uuid.random(),
      props.repoId,
      props.llmProvider,
      props.model,
      props.tokenLimit,
      props.temperature ?? 0.2,
      props.enabledCategories ?? [],
      null,
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
      props.llmProvider ?? this.llmProvider,
      props.model ?? this.model,
      props.tokenLimit ?? this.tokenLimit,
      props.temperature ?? this.temperature,
      props.enabledCategories ?? this.enabledCategories,
      "promptId" in props ? (props.promptId ?? null) : this.promptId,
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
    promptId: string | null;
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
      props.promptId,
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
      promptId: this.promptId,
    };
  }
}
