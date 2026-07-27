import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { CreateRepoUseCase } from "./create-repo-use-case";
import { CreateRepoController } from "./create-repo-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("CreateRepoController", () => {
  it("returns 400 when fullName is missing a slash", async () => {
    const useCase = new CreateRepoUseCase(mock<RepoRepository>(), mock<RepoConfigRepository>());
    const controller = new CreateRepoController(useCase);
    const req = { body: { fullName: "not-a-valid-name" }, userId: "user-1" } as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "validation_error" }) }),
    );
  });

  it("returns 201 with the repo and its default config on success", async () => {
    const useCase = new CreateRepoUseCase(mock<RepoRepository>(), mock<RepoConfigRepository>());
    const controller = new CreateRepoController(useCase);
    const req = { body: { fullName: "org/repo" }, userId: "user-1" } as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.fullName).toBe("org/repo");
    expect(body.scmProvider).toBe("github");
    expect(body.active).toBe(true);
    expect(body.config).toEqual(
      expect.objectContaining({ llmProvider: "gemini", temperature: 0.2, enabledCategories: [] }),
    );
  });
});
