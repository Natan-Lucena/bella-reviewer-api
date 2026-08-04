import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ListGithubReposUseCase } from "./list-github-repos-use-case";
import { ListGithubReposController } from "./list-github-repos-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("ListGithubReposController", () => {
  it("returns 400 when pat is missing", async () => {
    const useCase = new ListGithubReposUseCase(mock<RepoRepository>());
    const controller = new ListGithubReposController(useCase);
    const req = { body: {}, userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 200 with the repo list on success", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findByUserId.mockResolvedValue([]);
    const useCase = new ListGithubReposUseCase(repoRepository);
    vi.spyOn(useCase, "execute").mockResolvedValue({
      ok: true,
      value: [{ fullName: "org/repo", private: false, defaultBranch: "main", alreadyAdded: false }],
    });
    const controller = new ListGithubReposController(useCase);
    const req = { body: { pat: "ghp_token" }, userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      repos: [{ fullName: "org/repo", private: false, defaultBranch: "main", alreadyAdded: false }],
    });
  });

  it("returns 401 when GitHub rejects the token", async () => {
    const useCase = new ListGithubReposUseCase(mock<RepoRepository>());
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: false, error: "github_auth_failed" });
    const controller = new ListGithubReposController(useCase);
    const req = { body: { pat: "bad-pat" }, userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 429 when GitHub rate-limits the request", async () => {
    const useCase = new ListGithubReposUseCase(mock<RepoRepository>());
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: false, error: "github_rate_limited" });
    const controller = new ListGithubReposController(useCase);
    const req = { body: { pat: "ghp_token" }, userId: "user-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
  });
});
