import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { DeletePromptUseCase } from "./delete-prompt-use-case";

describe("DeletePromptUseCase", () => {
  it("deletes the prompt when owned by the requesting user", async () => {
    const prompt = Prompt.create({ userId: "user-1", name: "My prompt", content: "content" });
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(prompt);
    const useCase = new DeletePromptUseCase(promptRepository);

    const result = await useCase.execute({ userId: "user-1", promptId: prompt.id.value });

    expect(result.ok).toBe(true);
    expect(promptRepository.delete).toHaveBeenCalledWith(prompt.id.value);
  });

  it("fails with prompt_not_found when the prompt doesn't exist", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(null);
    const useCase = new DeletePromptUseCase(promptRepository);

    const result = await useCase.execute({ userId: "user-1", promptId: "missing-id" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("prompt_not_found");
    }
    expect(promptRepository.delete).not.toHaveBeenCalled();
  });

  it("fails with prompt_not_found (not 403) when the prompt belongs to another user", async () => {
    const prompt = Prompt.create({ userId: "someone-else", name: "Name", content: "content" });
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(prompt);
    const useCase = new DeletePromptUseCase(promptRepository);

    const result = await useCase.execute({ userId: "user-1", promptId: prompt.id.value });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("prompt_not_found");
    }
    expect(promptRepository.delete).not.toHaveBeenCalled();
  });
});
