import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { ListPromptsUseCase } from "./list-prompts-use-case";

describe("ListPromptsUseCase", () => {
  it("returns every prompt owned by the user", async () => {
    const prompt1 = Prompt.create({ userId: "user-1", name: "Prompt A", content: "content A" });
    const prompt2 = Prompt.create({ userId: "user-1", name: "Prompt B", content: "content B" });
    const promptRepository = mock<PromptRepository>();
    promptRepository.findByUserId.mockResolvedValue([prompt1, prompt2]);
    const useCase = new ListPromptsUseCase(promptRepository);

    const result = await useCase.execute({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.prompts).toHaveLength(2);
    expect(result.value.prompts).toEqual([prompt1, prompt2]);
    expect(promptRepository.findByUserId).toHaveBeenCalledWith("user-1");
  });

  it("does not return prompts belonging to another user", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findByUserId.mockResolvedValue([]);
    const useCase = new ListPromptsUseCase(promptRepository);

    const result = await useCase.execute({ userId: "user-1" });

    expect(result).toEqual({ ok: true, value: { prompts: [] } });
  });
});
