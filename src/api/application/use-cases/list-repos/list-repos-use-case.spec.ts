import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ListReposUseCase } from "./list-repos-use-case";

describe("ListReposUseCase", () => {
  it("returns every repo owned by the user, with configComplete computed per repo", async () => {
    const repo1 = Repo.create({ userId: "user-1", fullName: "org/complete" });
    const repo2 = Repo.create({ userId: "user-1", fullName: "org/partial" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findByUserId.mockResolvedValue([repo1, repo2]);

    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoIds.mockResolvedValue([
      RepoConfig.create({
        repoId: repo1.id.value,
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
      }),
      RepoConfig.create({
        repoId: repo2.id.value,
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
      }),
    ]);

    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findAllByRepoIds.mockResolvedValue([
      Credential.createLlm({ repoId: repo1.id.value, encryptedSecret: "x" }),
      Credential.createScm({ repoId: repo1.id.value, encryptedSecret: "x" }),
      Credential.createActionToken({ repoId: repo1.id.value, secretHash: "x" }),
      Credential.createWebhookSecret({ repoId: repo1.id.value, encryptedSecret: "x" }),
      Credential.createLlm({ repoId: repo2.id.value, encryptedSecret: "x" }),
    ]);

    const useCase = new ListReposUseCase(
      repoRepository,
      repoConfigRepository,
      credentialRepository,
    );

    const result = await useCase.execute({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.repos).toHaveLength(2);
    expect(result.value.repos[0]).toMatchObject({
      fullName: "org/complete",
      configComplete: true,
      llmProvider: "gemini",
      model: "gemini-2.5-flash",
    });
    expect(result.value.repos[1]).toMatchObject({
      fullName: "org/partial",
      configComplete: false,
    });

    // Two batched queries for the whole list, never one per repo.
    expect(repoConfigRepository.findByRepoIds).toHaveBeenCalledTimes(1);
    expect(repoConfigRepository.findByRepoIds).toHaveBeenCalledWith([
      repo1.id.value,
      repo2.id.value,
    ]);
    expect(credentialRepository.findAllByRepoIds).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when the user has no repos", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findByUserId.mockResolvedValue([]);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoIds.mockResolvedValue([]);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findAllByRepoIds.mockResolvedValue([]);
    const useCase = new ListReposUseCase(
      repoRepository,
      repoConfigRepository,
      credentialRepository,
    );

    const result = await useCase.execute({ userId: "user-1" });

    expect(result).toEqual({ ok: true, value: { repos: [] } });
  });
});
