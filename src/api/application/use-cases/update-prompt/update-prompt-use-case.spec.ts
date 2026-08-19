import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { UpdatePromptUseCase } from "./update-prompt-use-case";

describe("UpdatePromptUseCase", () => {
  it("updates name and content when owned by the requesting user", async () => {
    const prompt = Prompt.create({ userId: "user-1", name: "Old name", content: "old content" });
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(prompt);
    promptRepository.findByUserIdAndName.mockResolvedValue(null);
    const useCase = new UpdatePromptUseCase(promptRepository);

    const result = await useCase.execute({
      userId: "user-1",
      promptId: prompt.id.value,
      name: "New name",
      content: "new content",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("New name");
      expect(result.value.content).toBe("new content");
    }
    expect(promptRepository.save).toHaveBeenCalledTimes(1);
  });

  it("fails with prompt_not_found when the prompt doesn't exist", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(null);
    const useCase = new UpdatePromptUseCase(promptRepository);

    const result = await useCase.execute({ userId: "user-1", promptId: "missing-id", name: "x" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("prompt_not_found");
    }
  });

  it("fails with prompt_not_found (not 403) when the prompt belongs to another user", async () => {
    const prompt = Prompt.create({ userId: "someone-else", name: "Name", content: "content" });
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(prompt);
    const useCase = new UpdatePromptUseCase(promptRepository);

    const result = await useCase.execute({
      userId: "user-1",
      promptId: prompt.id.value,
      name: "New name",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("prompt_not_found");
    }
    expect(promptRepository.save).not.toHaveBeenCalled();
  });

  it("fails with prompt_name_already_exists when renaming to a name already used by another prompt", async () => {
    const prompt = Prompt.create({ userId: "user-1", name: "Old name", content: "content" });
    const otherPrompt = Prompt.create({
      userId: "user-1",
      name: "Taken name",
      content: "other content",
    });
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(prompt);
    promptRepository.findByUserIdAndName.mockResolvedValue(otherPrompt);
    const useCase = new UpdatePromptUseCase(promptRepository);

    const result = await useCase.execute({
      userId: "user-1",
      promptId: prompt.id.value,
      name: "Taken name",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("prompt_name_already_exists");
    }
    expect(promptRepository.save).not.toHaveBeenCalled();
  });

  it("does not treat the prompt's own current name as a collision", async () => {
    const prompt = Prompt.create({ userId: "user-1", name: "Same name", content: "content" });
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(prompt);
    promptRepository.findByUserIdAndName.mockResolvedValue(prompt);
    const useCase = new UpdatePromptUseCase(promptRepository);

    const result = await useCase.execute({
      userId: "user-1",
      promptId: prompt.id.value,
      name: "Same name",
      content: "updated content",
    });

    expect(result.ok).toBe(true);
    expect(promptRepository.save).toHaveBeenCalledTimes(1);
  });
});
