import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { hash } from "../../../../shared/infra/crypto/hashing";
import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { GenerateActionTokenUseCase } from "./generate-action-token-use-case";

describe("GenerateActionTokenUseCase", () => {
  it("returns repo_not_found when the repo isn't owned by the requesting user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const credentialRepository = mock<CredentialRepository>();
    const useCase = new GenerateActionTokenUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({ userId: "user-1", repoId: "repo-1" });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
    expect(credentialRepository.save).not.toHaveBeenCalled();
  });

  it("creates a new hashed action_token when none exists yet", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
    const useCase = new GenerateActionTokenUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({ userId: "user-1", repoId: repo.id.value });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toEqual(expect.any(String));
    expect(result.value.token.length).toBeGreaterThan(0);

    const savedCredential = credentialRepository.save.mock.calls[0][0];
    expect(savedCredential.type).toBe("action_token");
    expect(savedCredential.secretHash).toBe(hash(result.value.token));
    expect(savedCredential.encryptedSecret).toBeNull();
  });

  it("replaces the existing action_token instead of creating a second one", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const existing = Credential.createActionToken({
      repoId: repo.id.value,
      secretHash: "old-hash",
    });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(existing);
    const useCase = new GenerateActionTokenUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({ userId: "user-1", repoId: repo.id.value });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const savedCredential = credentialRepository.save.mock.calls[0][0];
    expect(savedCredential.id.value).toBe(existing.id.value);
    expect(savedCredential.secretHash).not.toBe("old-hash");
    expect(savedCredential.secretHash).toBe(hash(result.value.token));
  });
});
