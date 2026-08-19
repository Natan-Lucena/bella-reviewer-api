import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { Prompt } from "../../../domain/entities/prompt.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { ListPromptsUseCase } from "./list-prompts-use-case";
import { ListPromptsController } from "./list-prompts-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("ListPromptsController", () => {
  it("returns 200 with the user's prompts serialized via toJSON", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findByUserId.mockResolvedValue([
      Prompt.create({ userId: "user-1", name: "Prompt A", content: "content A" }),
    ]);
    const controller = new ListPromptsController(new ListPromptsUseCase(promptRepository));
    const req = { userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body).toEqual({
      prompts: [expect.objectContaining({ name: "Prompt A", content: "content A" })],
    });
  });

  it("returns 200 with an empty list when the user has no prompts", async () => {
    const promptRepository = mock<PromptRepository>();
    promptRepository.findByUserId.mockResolvedValue([]);
    const controller = new ListPromptsController(new ListPromptsUseCase(promptRepository));
    const req = { userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ prompts: [] });
  });
});
