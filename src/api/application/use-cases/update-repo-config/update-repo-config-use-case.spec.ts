import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Prompt } from "../../../domain/entities/prompt.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { UpdateRepoConfigUseCase } from "./update-repo-config-use-case";

describe("UpdateRepoConfigUseCase", () => {
  it("fails with repo_not_found when the repo doesn't belong to the user", async () => {
    const repo = Repo.create({ userId: "owner", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const repoConfigRepository = mock<RepoConfigRepository>();
    const promptRepository = mock<PromptRepository>();
    const useCase = new UpdateRepoConfigUseCase(
      repoRepository,
      repoConfigRepository,
      promptRepository,
    );

    const result = await useCase.execute({
      userId: "someone-else",
      repoId: repo.id.value,
      temperature: 0.5,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("repo_not_found");
    }
    expect(repoConfigRepository.save).not.toHaveBeenCalled();
  });

  it("fails with repo_not_found when the repo doesn't exist", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const repoConfigRepository = mock<RepoConfigRepository>();
    const promptRepository = mock<PromptRepository>();
    const useCase = new UpdateRepoConfigUseCase(
      repoRepository,
      repoConfigRepository,
      promptRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: "missing-id",
      temperature: 0.5,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("repo_not_found");
    }
  });

  it("only updates the fields present in the request, leaving the rest untouched", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const existingConfig = RepoConfig.create({
      repoId: repo.id.value,
      llmProvider: "gemini",
      model: "gemini-2.5-flash",
      tokenLimit: 100000,
      temperature: 0.2,
      enabledCategories: ["security"],
    });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(existingConfig);
    const promptRepository = mock<PromptRepository>();
    const useCase = new UpdateRepoConfigUseCase(
      repoRepository,
      repoConfigRepository,
      promptRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      temperature: 0.5,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.temperature).toBe(0.5);
      expect(result.value.model).toBe("gemini-2.5-flash");
      expect(result.value.tokenLimit).toBe(100000);
      expect(result.value.enabledCategories).toEqual(["security"]);
    }
    expect(repoConfigRepository.save).toHaveBeenCalledTimes(1);
  });

  describe("promptId three-state semantics", () => {
    function setup(promptId: string | null) {
      const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
      const existingConfig = RepoConfig.create({
        repoId: repo.id.value,
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
      }).update({ promptId });
      const repoRepository = mock<RepoRepository>();
      repoRepository.findById.mockResolvedValue(repo);
      const repoConfigRepository = mock<RepoConfigRepository>();
      repoConfigRepository.findByRepoId.mockResolvedValue(existingConfig);
      const promptRepository = mock<PromptRepository>();
      const useCase = new UpdateRepoConfigUseCase(
        repoRepository,
        repoConfigRepository,
        promptRepository,
      );
      return { repo, useCase, promptRepository, repoConfigRepository };
    }

    it("leaves the current promptId unchanged when the field is omitted", async () => {
      const { repo, useCase } = setup("11111111-1111-1111-1111-111111111111");

      const result = await useCase.execute({
        userId: "user-1",
        repoId: repo.id.value,
        temperature: 0.5,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.promptId).toBe("11111111-1111-1111-1111-111111111111");
      }
    });

    it("clears promptId to null when explicitly set to null", async () => {
      const { repo, useCase } = setup("11111111-1111-1111-1111-111111111111");

      const result = await useCase.execute({
        userId: "user-1",
        repoId: repo.id.value,
        promptId: null,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.promptId).toBeNull();
      }
    });

    it("sets promptId when given a valid prompt id owned by the user", async () => {
      const { repo, useCase, promptRepository } = setup(null);
      const prompt = Prompt.create({ userId: "user-1", name: "My prompt", content: "Focus on X" });
      promptRepository.findById.mockResolvedValue(prompt);

      const result = await useCase.execute({
        userId: "user-1",
        repoId: repo.id.value,
        promptId: prompt.id.value,
      });

      expect(promptRepository.findById).toHaveBeenCalledWith(prompt.id.value);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.promptId).toBe(prompt.id.value);
      }
    });

    it("fails with prompt_not_found when the prompt doesn't exist", async () => {
      const { repo, useCase, promptRepository, repoConfigRepository } = setup(null);
      promptRepository.findById.mockResolvedValue(null);

      const result = await useCase.execute({
        userId: "user-1",
        repoId: repo.id.value,
        promptId: "99999999-9999-9999-9999-999999999999",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("prompt_not_found");
      }
      expect(repoConfigRepository.save).not.toHaveBeenCalled();
    });

    it("fails with prompt_not_found when the prompt belongs to another user", async () => {
      const { repo, useCase, promptRepository, repoConfigRepository } = setup(null);
      const otherUsersPrompt = Prompt.create({
        userId: "someone-else",
        name: "Their prompt",
        content: "Focus on Y",
      });
      promptRepository.findById.mockResolvedValue(otherUsersPrompt);

      const result = await useCase.execute({
        userId: "user-1",
        repoId: repo.id.value,
        promptId: otherUsersPrompt.id.value,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("prompt_not_found");
      }
      expect(repoConfigRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("reviewLanguage", () => {
    it("persists a valid reviewLanguage", async () => {
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
      const useCase = new UpdateRepoConfigUseCase(
        repoRepository,
        repoConfigRepository,
        promptRepository,
      );

      const result = await useCase.execute({
        userId: "user-1",
        repoId: repo.id.value,
        reviewLanguage: "es",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reviewLanguage).toBe("es");
      }
      const savedConfig = repoConfigRepository.save.mock.calls[0][0];
      expect(savedConfig.reviewLanguage).toBe("es");
    });

    it("leaves reviewLanguage unchanged when the field is omitted, even when other fields are updated (regression)", async () => {
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
      const promptRepository = mock<PromptRepository>();
      const useCase = new UpdateRepoConfigUseCase(
        repoRepository,
        repoConfigRepository,
        promptRepository,
      );

      const result = await useCase.execute({
        userId: "user-1",
        repoId: repo.id.value,
        model: "gemini-2.5-pro",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reviewLanguage).toBe("es");
        expect(result.value.model).toBe("gemini-2.5-pro");
      }
    });
  });
});
