import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { CreatePromptUseCase } from "./create-prompt-use-case";

describe("CreatePromptUseCase", () => {
  it("creates a new prompt when the name isn't taken yet", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findByUserIdAndName.mockResolvedValue(null);
    const useCase = new CreatePromptUseCase(promptRepository);

    const result = await useCase.execute({
      userId: "user-1",
      name: "Focus on security",
      content: "Pay extra attention to auth and secrets handling.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Focus on security");
      expect(result.value.userId).toBe("user-1");
    }
    expect(promptRepository.save).toHaveBeenCalledTimes(1);
  });

  it("fails with prompt_name_already_exists when the user already has a prompt with that name", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findByUserIdAndName.mockResolvedValue(
      Prompt.create({ userId: "user-1", name: "Focus on security", content: "existing" }),
    );
    const useCase = new CreatePromptUseCase(promptRepository);

    const result = await useCase.execute({
      userId: "user-1",
      name: "Focus on security",
      content: "new content",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("prompt_name_already_exists");
    }
    expect(promptRepository.save).not.toHaveBeenCalled();
  });
});
