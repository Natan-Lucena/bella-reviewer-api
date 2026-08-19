import { failure, Result, success } from "../../../../shared/core/result";
import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";

export type UpdatePromptParams = {
  userId: string;
  promptId: string;
  name?: string;
  content?: string;
};

export type UpdatePromptError = "prompt_not_found" | "prompt_name_already_exists";

export class UpdatePromptUseCase {
  constructor(private readonly promptRepository: PromptRepository) {}

  async execute(params: UpdatePromptParams): Promise<Result<Prompt, UpdatePromptError>> {
    const existingPrompt = await this.promptRepository.findById(params.promptId);
    // Not found and "exists but belongs to someone else" return the same
    // error — never confirms a resource's existence to a non-owner.
    if (!existingPrompt || existingPrompt.userId !== params.userId) {
      return failure("prompt_not_found");
    }

    if (params.name && params.name !== existingPrompt.name) {
      const collision = await this.promptRepository.findByUserIdAndName(params.userId, params.name);
      if (collision && collision.id.value !== params.promptId) {
        return failure("prompt_name_already_exists");
      }
    }

    const updatedPrompt = existingPrompt.update({
      name: params.name,
      content: params.content,
    });
    await this.promptRepository.save(updatedPrompt);

    return success(updatedPrompt);
  }
}
