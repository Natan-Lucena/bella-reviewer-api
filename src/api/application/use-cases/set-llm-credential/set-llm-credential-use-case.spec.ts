import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { getDefaultModelForProvider } from "../../../domain/services/llm-provider-catalog";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { SetLlmCredentialUseCase } from "./set-llm-credential-use-case";

function baseRepoConfig(repoId: string) {
  return RepoConfig.create({
    repoId,
    llmProvider: "gemini",
    model: "gemini-2.5-flash",
    tokenLimit: 100000,
  });
}

describe("SetLlmCredentialUseCase", () => {
  it("returns repo_not_found when the repo isn't owned by the requesting user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const credentialRepository = mock<CredentialRepository>();
    const repoConfigRepository = mock<RepoConfigRepository>();
    const useCase = new SetLlmCredentialUseCase(
      repoRepository,
      credentialRepository,
      repoConfigRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: "repo-1",
      provider: "gemini",
      apiKey: "gemini-key",
    });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
    expect(credentialRepository.save).not.toHaveBeenCalled();
  });

  it("returns repo_not_found when the repo has no RepoConfig (should be impossible)", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(null);
    const useCase = new SetLlmCredentialUseCase(
      repoRepository,
      credentialRepository,
      repoConfigRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      provider: "gemini",
      apiKey: "gemini-key",
    });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
    expect(credentialRepository.save).not.toHaveBeenCalled();
  });

  it("creates a new encrypted llm credential when none exists yet", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(baseRepoConfig(repo.id.value));
    const useCase = new SetLlmCredentialUseCase(
      repoRepository,
      credentialRepository,
      repoConfigRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      provider: "gemini",
      apiKey: "gemini-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe("llm");
    expect(result.value.provider).toBe("gemini");
    expect(result.value.encryptedSecret).not.toBe("gemini-key");
    expect(decrypt(result.value.encryptedSecret as string)).toBe("gemini-key");
    expect(credentialRepository.save).toHaveBeenCalledWith(result.value);
  });

  it("replaces the existing llm credential instead of creating a second one, for the same provider", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const existing = Credential.createLlm({
      repoId: repo.id.value,
      provider: "gemini",
      encryptedSecret: "old-cipher-text",
    });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(existing);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(baseRepoConfig(repo.id.value));
    const useCase = new SetLlmCredentialUseCase(
      repoRepository,
      credentialRepository,
      repoConfigRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      provider: "gemini",
      apiKey: "new-gemini-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id.value).toBe(existing.id.value);
    expect(result.value.provider).toBe("gemini");
    expect(decrypt(result.value.encryptedSecret as string)).toBe("new-gemini-key");
  });

  it("switching provider reuses the same credential row instead of inserting a second one", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const existing = Credential.createLlm({
      repoId: repo.id.value,
      provider: "gemini",
      encryptedSecret: "old-gemini-cipher-text",
    });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(existing);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(baseRepoConfig(repo.id.value));
    const useCase = new SetLlmCredentialUseCase(
      repoRepository,
      credentialRepository,
      repoConfigRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      provider: "claude",
      apiKey: "claude-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Same id as the pre-existing Gemini row — never a second credential row.
    expect(result.value.id.value).toBe(existing.id.value);
    expect(result.value.provider).toBe("claude");
    expect(decrypt(result.value.encryptedSecret as string)).toBe("claude-key");
    expect(credentialRepository.save).toHaveBeenCalledTimes(1);
  });

  it("switching provider updates RepoConfig.llmProvider and defaults model from the catalog", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(baseRepoConfig(repo.id.value));
    const useCase = new SetLlmCredentialUseCase(
      repoRepository,
      credentialRepository,
      repoConfigRepository,
    );

    await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      provider: "claude",
      apiKey: "claude-key",
    });

    expect(repoConfigRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        llmProvider: "claude",
        model: getDefaultModelForProvider("claude"),
      }),
    );
  });

  it("uses the explicitly given model instead of the catalog default when provided", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(baseRepoConfig(repo.id.value));
    const useCase = new SetLlmCredentialUseCase(
      repoRepository,
      credentialRepository,
      repoConfigRepository,
    );

    await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      provider: "claude",
      apiKey: "claude-key",
      model: "claude-opus-4-1",
    });

    expect(repoConfigRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-opus-4-1" }),
    );
  });

  it("saves the credential before the config, so a config-write failure doesn't lose the new secret", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(baseRepoConfig(repo.id.value));
    repoConfigRepository.save.mockRejectedValue(new Error("db error"));
    const useCase = new SetLlmCredentialUseCase(
      repoRepository,
      credentialRepository,
      repoConfigRepository,
    );

    await expect(
      useCase.execute({
        userId: "user-1",
        repoId: repo.id.value,
        provider: "claude",
        apiKey: "claude-key",
      }),
    ).rejects.toThrow("db error");

    // Documented, expected behavior (not a bug): the credential write already
    // landed even though the second write failed — see the use case's own
    // comment on write ordering.
    expect(credentialRepository.save).toHaveBeenCalledTimes(1);
  });
});
