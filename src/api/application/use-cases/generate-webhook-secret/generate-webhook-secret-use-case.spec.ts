import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { decrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { GenerateWebhookSecretUseCase } from "./generate-webhook-secret-use-case";

describe("GenerateWebhookSecretUseCase", () => {
  it("returns repo_not_found when the repo isn't owned by the requesting user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const credentialRepository = mock<CredentialRepository>();
    const useCase = new GenerateWebhookSecretUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({ userId: "user-1", repoId: "repo-1" });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
    expect(credentialRepository.save).not.toHaveBeenCalled();
  });

  it("creates a new encrypted webhook_secret and returns the webhook URL", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
    const useCase = new GenerateWebhookSecretUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({ userId: "user-1", repoId: repo.id.value });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.secret.length).toBeGreaterThan(0);
    expect(result.value.webhookUrl).toContain("/webhooks/github");

    const savedCredential = credentialRepository.save.mock.calls[0][0];
    expect(savedCredential.type).toBe("webhook_secret");
    expect(savedCredential.secretHash).toBeNull();
    expect(decrypt(savedCredential.encryptedSecret as string)).toBe(result.value.secret);
  });

  it("replaces the existing webhook_secret instead of creating a second one", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const existing = Credential.createEncrypted({
      repoId: repo.id.value,
      type: "webhook_secret",
      provider: "github",
      encryptedSecret: "old-cipher-text",
    });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(existing);
    const useCase = new GenerateWebhookSecretUseCase(repoRepository, credentialRepository);

    const result = await useCase.execute({ userId: "user-1", repoId: repo.id.value });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const savedCredential = credentialRepository.save.mock.calls[0][0];
    expect(savedCredential.id.value).toBe(existing.id.value);
    expect(savedCredential.encryptedSecret).not.toBe("old-cipher-text");
    expect(decrypt(savedCredential.encryptedSecret as string)).toBe(result.value.secret);
  });
});
