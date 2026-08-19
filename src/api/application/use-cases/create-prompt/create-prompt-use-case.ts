import { failure, Result, success } from "../../../../shared/core/result";
import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";

export type CreatePromptParams = {
  userId: string;
  name: string;
  content: string;
};

export type CreatePromptError = "prompt_name_already_exists";

export class CreatePromptUseCase {
  constructor(private readonly promptRepository: PromptRepository) {}

  async execute(params: CreatePromptParams): Promise<Result<Prompt, CreatePromptError>> {
    const existing = await this.promptRepository.findByUserIdAndName(params.userId, params.name);
    if (existing) {
      return failure("prompt_name_already_exists");
    }

    const prompt = Prompt.create({
      userId: params.userId,
      name: params.name,
      content: params.content,
    });
    await this.promptRepository.save(prompt);

    return success(prompt);
  }
}
