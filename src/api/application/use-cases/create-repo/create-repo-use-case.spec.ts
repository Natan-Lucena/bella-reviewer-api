import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { CreateRepoUseCase } from "./create-repo-use-case";

describe("CreateRepoUseCase", () => {
  it("creates a Repo owned by the given user", async () => {
    const repoRepository = mock<RepoRepository>();
    const repoConfigRepository = mock<RepoConfigRepository>();
    const useCase = new CreateRepoUseCase(repoRepository, repoConfigRepository);

    const result = await useCase.execute({ userId: "user-1", fullName: "org/repo" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.repo.userId).toBe("user-1");
      expect(result.value.repo.fullName).toBe("org/repo");
      expect(result.value.repo.active).toBe(true);
    }
    expect(repoRepository.save).toHaveBeenCalledTimes(1);
  });

  it("creates a RepoConfig for the new repo with the configured defaults", async () => {
    const repoRepository = mock<RepoRepository>();
    const repoConfigRepository = mock<RepoConfigRepository>();
    const useCase = new CreateRepoUseCase(repoRepository, repoConfigRepository);

    const result = await useCase.execute({ userId: "user-1", fullName: "org/repo" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config.repoId).toBe(result.value.repo.id.value);
      expect(result.value.config.llmProvider).toBe("gemini");
      expect(result.value.config.temperature).toBe(0.2);
      expect(result.value.config.enabledCategories).toEqual([]);
    }
    expect(repoConfigRepository.save).toHaveBeenCalledTimes(1);
  });
});
