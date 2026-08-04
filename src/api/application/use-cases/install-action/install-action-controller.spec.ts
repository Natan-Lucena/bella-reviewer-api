import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { Repo } from "../../../domain/entities/repo.entity";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { InstallActionUseCase } from "./install-action-use-case";
import { InstallActionController } from "./install-action-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("InstallActionController", () => {
  it("returns 400 when pat is missing", async () => {
    const useCase = new InstallActionUseCase(mock<RepoRepository>());
    const controller = new InstallActionController(useCase);
    const req = { body: {}, params: { id: "repo-1" }, userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the repo isn't owned by the requesting user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new InstallActionUseCase(repoRepository);
    const controller = new InstallActionController(useCase);
    const req = {
      body: { pat: "ghp_token" },
      params: { id: "repo-1" },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 200 with the prUrl on success", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const useCase = new InstallActionUseCase(mock<RepoRepository>());
    vi.spyOn(useCase, "execute").mockResolvedValue({
      ok: true,
      value: { prUrl: "https://github.com/org/repo/pull/1" },
    });
    const controller = new InstallActionController(useCase);
    const req = {
      body: { pat: "ghp_token" },
      params: { id: repo.id.value },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ prUrl: "https://github.com/org/repo/pull/1" });
  });

  it("returns 403 when the token lacks sufficient scope", async () => {
    const useCase = new InstallActionUseCase(mock<RepoRepository>());
    vi.spyOn(useCase, "execute").mockResolvedValue({
      ok: false,
      error: "github_insufficient_scope",
    });
    const controller = new InstallActionController(useCase);
    const req = {
      body: { pat: "ghp_token" },
      params: { id: "repo-1" },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
