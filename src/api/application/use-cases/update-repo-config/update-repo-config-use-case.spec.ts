import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Repo } from "../../../domain/entities/repo.entity";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { UpdateRepoConfigUseCase } from "./update-repo-config-use-case";

describe("UpdateRepoConfigUseCase", () => {
  it("fails with repo_not_found when the repo doesn't belong to the user", async () => {
    const repo = Repo.create({ userId: "owner", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const repoConfigRepository = mock<RepoConfigRepository>();
    const useCase = new UpdateRepoConfigUseCase(repoRepository, repoConfigRepository);

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
    const useCase = new UpdateRepoConfigUseCase(repoRepository, repoConfigRepository);

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
    const useCase = new UpdateRepoConfigUseCase(repoRepository, repoConfigRepository);

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
});
