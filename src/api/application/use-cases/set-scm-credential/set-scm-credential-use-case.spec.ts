import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { SetScmCredentialUseCase } from "./set-scm-credential-use-case";

describe("SetScmCredentialUseCase", () => {
  it("returns repo_not_found when the repo isn't owned by the requesting user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const credentialRepository = mock<CredentialRepository>();
    const useCase = new SetScmCredentialUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({ userId: "user-1", repoId: "repo-1", pat: "ghp_token" });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
    expect(credentialRepository.save).not.toHaveBeenCalled();
  });

  it("creates a new encrypted scm credential when none exists yet", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
    const useCase = new SetScmCredentialUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      pat: "ghp_token",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe("scm");
    expect(result.value.provider).toBe("github");
    expect(decrypt(result.value.encryptedSecret as string)).toBe("ghp_token");
    expect(credentialRepository.save).toHaveBeenCalledWith(result.value);
  });

  it("replaces the existing scm credential and resets its validation state", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const existing = Credential.createScm({
      repoId: repo.id.value,
      encryptedSecret: "old-cipher-text",
    });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(existing);
    const useCase = new SetScmCredentialUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      pat: "ghp_new_token",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id.value).toBe(existing.id.value);
    expect(decrypt(result.value.encryptedSecret as string)).toBe("ghp_new_token");
    expect(result.value.lastValidatedAt).toBeNull();
    expect(result.value.scopes).toBeNull();
  });
});
