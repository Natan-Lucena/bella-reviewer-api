import { failure, Result, success } from "../../../../shared/core/result";
import { PromptRepository } from "../../../domain/repository/prompt.repository";

export type DeletePromptParams = {
  userId: string;
  promptId: string;
};

export type DeletePromptError = "prompt_not_found";

export class DeletePromptUseCase {
  constructor(private readonly promptRepository: PromptRepository) {}

  async execute(params: DeletePromptParams): Promise<Result<void, DeletePromptError>> {
    const existingPrompt = await this.promptRepository.findById(params.promptId);
    // Not found and "exists but belongs to someone else" return the same
    // error — never confirms a resource's existence to a non-owner.
    if (!existingPrompt || existingPrompt.userId !== params.userId) {
      return failure("prompt_not_found");
    }

    await this.promptRepository.delete(params.promptId);

    return success(undefined);
  }
}
