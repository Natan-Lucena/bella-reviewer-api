import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { UpdatePromptUseCase } from "./update-prompt-use-case";
import { UpdatePromptController } from "./update-prompt-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("UpdatePromptController", () => {
  it("returns 400 for a malformed body", async () => {
    const promptRepository = mock<PromptRepository>();
    const controller = new UpdatePromptController(new UpdatePromptUseCase(promptRepository));
    const req = {
      body: { name: "" },
      params: { id: "prompt-1" },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the prompt isn't owned by the requesting user", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(null);
    const controller = new UpdatePromptController(new UpdatePromptUseCase(promptRepository));
    const req = {
      body: { name: "New name" },
      params: { id: "prompt-1" },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 409 when the new name collides with another prompt", async () => {
    const prompt = Prompt.create({ userId: "user-1", name: "Old name", content: "content" });
    const otherPrompt = Prompt.create({ userId: "user-1", name: "Taken", content: "content" });
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(prompt);
    promptRepository.findByUserIdAndName.mockResolvedValue(otherPrompt);
    const controller = new UpdatePromptController(new UpdatePromptUseCase(promptRepository));
    const req = {
      body: { name: "Taken" },
      params: { id: prompt.id.value },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("returns 200 with the updated prompt on success", async () => {
    const prompt = Prompt.create({ userId: "user-1", name: "Old name", content: "old content" });
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(prompt);
    promptRepository.findByUserIdAndName.mockResolvedValue(null);
    const controller = new UpdatePromptController(new UpdatePromptUseCase(promptRepository));
    const req = {
      body: { content: "new content" },
      params: { id: prompt.id.value },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.content).toBe("new content");
  });
});
