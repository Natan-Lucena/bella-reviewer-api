import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ListReposController } from "./list-repos-controller";
import { ListReposUseCase } from "./list-repos-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("ListReposController", () => {
  it("returns 200 with the repos returned by the use case", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findByUserId.mockResolvedValue([]);
    const useCase = new ListReposUseCase(
      repoRepository,
      mock<RepoConfigRepository>(),
      mock<CredentialRepository>(),
    );
    const controller = new ListReposController(useCase);
    const req = { userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ repos: [] });
  });
});
