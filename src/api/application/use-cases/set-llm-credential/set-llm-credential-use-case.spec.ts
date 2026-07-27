import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { SetLlmCredentialUseCase } from "./set-llm-credential-use-case";

describe("SetLlmCredentialUseCase", () => {
  it("returns repo_not_found when the repo isn't owned by the requesting user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const credentialRepository = mock<CredentialRepository>();
    const useCase = new SetLlmCredentialUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({
      userId: "user-1",
      repoId: "repo-1",
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
    const useCase = new SetLlmCredentialUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
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

  it("replaces the existing llm credential instead of creating a second one", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const existing = Credential.createLlm({
      repoId: repo.id.value,
      encryptedSecret: "old-cipher-text",
    });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(existing);
    const useCase = new SetLlmCredentialUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      apiKey: "new-gemini-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id.value).toBe(existing.id.value);
    expect(decrypt(result.value.encryptedSecret as string)).toBe("new-gemini-key");
  });
});
