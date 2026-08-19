import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { CreatePromptUseCase } from "./create-prompt-use-case";
import { CreatePromptController } from "./create-prompt-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("CreatePromptController", () => {
  it("returns 400 for a malformed body", async () => {
    const promptRepository = mock<PromptRepository>();
    const controller = new CreatePromptController(new CreatePromptUseCase(promptRepository));
    const req = { body: { name: "", content: "" }, userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "validation_error" }) }),
    );
  });

  it("returns 409 when the user already has a prompt with that name", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findByUserIdAndName.mockResolvedValue(
      Prompt.create({ userId: "user-1", name: "My prompt", content: "existing" }),
    );
    const controller = new CreatePromptController(new CreatePromptUseCase(promptRepository));
    const req = {
      body: { name: "My prompt", content: "new content" },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("returns 201 with the created prompt on success", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findByUserIdAndName.mockResolvedValue(null);
    const controller = new CreatePromptController(new CreatePromptUseCase(promptRepository));
    const req = {
      body: { name: "My prompt", content: "some content" },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.name).toBe("My prompt");
    expect(body.content).toBe("some content");
  });
});
