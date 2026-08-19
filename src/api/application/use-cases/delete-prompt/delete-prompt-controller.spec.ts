import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { DeletePromptUseCase } from "./delete-prompt-use-case";
import { DeletePromptController } from "./delete-prompt-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

describe("DeletePromptController", () => {
  it("returns 404 when the prompt isn't owned by the requesting user", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(null);
    const controller = new DeletePromptController(new DeletePromptUseCase(promptRepository));
    const req = { params: { id: "prompt-1" }, userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 204 with no body on success", async () => {
    const prompt = Prompt.create({ userId: "user-1", name: "My prompt", content: "content" });
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(prompt);
    const controller = new DeletePromptController(new DeletePromptUseCase(promptRepository));
    const req = { params: { id: prompt.id.value }, userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });
});
