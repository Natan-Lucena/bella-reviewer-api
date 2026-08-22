import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { Repo } from "../../../domain/entities/repo.entity";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { UpdateRepoConfigUseCase } from "./update-repo-config-use-case";
import { UpdateRepoConfigController } from "./update-repo-config-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("UpdateRepoConfigController", () => {
  it("returns 400 when temperature is out of range", async () => {
    const useCase = new UpdateRepoConfigUseCase(
      mock<RepoRepository>(),
      mock<RepoConfigRepository>(),
      mock<PromptRepository>(),
    );
    const controller = new UpdateRepoConfigController(useCase);
    const req = {
      body: { temperature: 5 },
      params: { id: "repo-1" },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the repo isn't owned by the requesting user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new UpdateRepoConfigUseCase(
      repoRepository,
      mock<RepoConfigRepository>(),
      mock<PromptRepository>(),
    );
    const controller = new UpdateRepoConfigController(useCase);
    const req = {
      body: { temperature: 0.5 },
      params: { id: "repo-1" },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 404 when promptId refers to a prompt not owned by the user", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const existingConfig = RepoConfig.create({
      repoId: repo.id.value,
      llmProvider: "gemini",
      model: "gemini-2.5-flash",
      tokenLimit: 100000,
    });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(existingConfig);
    const promptRepository = mock<PromptRepository>();
    promptRepository.findById.mockResolvedValue(null);
    const useCase = new UpdateRepoConfigUseCase(
      repoRepository,
      repoConfigRepository,
      promptRepository,
    );
    const controller = new UpdateRepoConfigController(useCase);
    const req = {
      body: { promptId: "99999999-9999-9999-9999-999999999999" },
      params: { id: repo.id.value },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.code).toBe("prompt_not_found");
  });

  it("returns 200 with the updated config on success", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const existingConfig = RepoConfig.create({
      repoId: repo.id.value,
      llmProvider: "gemini",
      model: "gemini-2.5-flash",
      tokenLimit: 100000,
    });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(existingConfig);
    const useCase = new UpdateRepoConfigUseCase(
      repoRepository,
      repoConfigRepository,
      mock<PromptRepository>(),
    );
    const controller = new UpdateRepoConfigController(useCase);
    const req = {
      body: { temperature: 0.7 },
      params: { id: repo.id.value },
      userId: "user-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.temperature).toBe(0.7);
  });

  describe("reviewLanguage", () => {
    it.each(["fr", "xx"])(
      "returns 400 when reviewLanguage is %s (outside the enum)",
      async (value) => {
        const useCase = new UpdateRepoConfigUseCase(
          mock<RepoRepository>(),
          mock<RepoConfigRepository>(),
          mock<PromptRepository>(),
        );
        const controller = new UpdateRepoConfigController(useCase);
        const req = {
          body: { reviewLanguage: value },
          params: { id: "repo-1" },
          userId: "user-1",
        } as unknown as Request;
        const res = createMockResponse();

        await controller.execute(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      },
    );

    it("returns 200 and persists a valid reviewLanguage", async () => {
      const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
      const existingConfig = RepoConfig.create({
        repoId: repo.id.value,
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
      });
      const repoRepository = mock<RepoRepository>();
      repoRepository.findById.mockResolvedValue(repo);
      const repoConfigRepository = mock<RepoConfigRepository>();
      repoConfigRepository.findByRepoId.mockResolvedValue(existingConfig);
      const useCase = new UpdateRepoConfigUseCase(
        repoRepository,
        repoConfigRepository,
        mock<PromptRepository>(),
      );
      const controller = new UpdateRepoConfigController(useCase);
      const req = {
        body: { reviewLanguage: "es" },
        params: { id: repo.id.value },
        userId: "user-1",
      } as unknown as Request;
      const res = createMockResponse();

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(body.reviewLanguage).toBe("es");
    });

    it("regression: a repo already configured with reviewLanguage 'es' keeps it when the PATCH only sends model", async () => {
      const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
      const existingConfig = RepoConfig.create({
        repoId: repo.id.value,
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
        reviewLanguage: "es",
      });
      const repoRepository = mock<RepoRepository>();
      repoRepository.findById.mockResolvedValue(repo);
      const repoConfigRepository = mock<RepoConfigRepository>();
      repoConfigRepository.findByRepoId.mockResolvedValue(existingConfig);
      const useCase = new UpdateRepoConfigUseCase(
        repoRepository,
        repoConfigRepository,
        mock<PromptRepository>(),
      );
      const controller = new UpdateRepoConfigController(useCase);
      const req = {
        body: { model: "gemini-2.5-pro" },
        params: { id: repo.id.value },
        userId: "user-1",
      } as unknown as Request;
      const res = createMockResponse();

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(body.reviewLanguage).toBe("es");
      expect(body.model).toBe("gemini-2.5-pro");
    });
  });
});
