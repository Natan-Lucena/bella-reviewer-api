import { config } from "../../../../config";
import { failure, Result, success } from "../../../../shared/core/result";
import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { generateRandomSecret } from "../../../../shared/infra/crypto/random-secret";
import { Credential } from "../../../domain/entities/credential.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";

export type GenerateWebhookSecretParams = {
  userId: string;
  repoId: string;
};

export type GenerateWebhookSecretResult = {
  secret: string;
  webhookUrl: string;
};

export type GenerateWebhookSecretError = "repo_not_found";

export class GenerateWebhookSecretUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly credentialRepository: CredentialRepository,
  ) {}

  async execute(
    params: GenerateWebhookSecretParams,
  ): Promise<Result<GenerateWebhookSecretResult, GenerateWebhookSecretError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    // Unlike the action_token, this needs to be recoverable in plaintext at
    // runtime (to recompute the webhook's HMAC signature), so it's encrypted
    // rather than hashed — but just like the token, this response is the
    // only time the caller ever sees the plaintext value again.
    const secret = generateRandomSecret();
    const encryptedSecret = encrypt(secret);

    // UNIQUE(repoId, type) — replace the existing row instead of inserting a
    // second one; nothing keeps a usable reference to the old secret once
    // this save completes.
    const existing = await this.credentialRepository.findByRepoIdAndType(
      params.repoId,
      "webhook_secret",
    );
    const credential = existing
      ? existing.rotateSecret(encryptedSecret)
      : Credential.createEncrypted({
          repoId: params.repoId,
          type: "webhook_secret",
          provider: "github",
          encryptedSecret,
        });

    await this.credentialRepository.save(credential);

    return success({ secret, webhookUrl: `${config.BACKEND_PUBLIC_URL}/webhooks/github` });
  }
}
