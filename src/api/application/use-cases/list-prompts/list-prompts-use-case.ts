import { Result, success } from "../../../../shared/core/result";
import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";

export type ListPromptsParams = {
  userId: string;
};

export type ListPromptsResult = {
  prompts: Prompt[];
};

export class ListPromptsUseCase {
  constructor(private readonly promptRepository: PromptRepository) {}

  async execute(params: ListPromptsParams): Promise<Result<ListPromptsResult, never>> {
    const prompts = await this.promptRepository.findByUserId(params.userId);
    return success({ prompts });
  }
}
