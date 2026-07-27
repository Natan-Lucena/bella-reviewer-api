import { failure, Result, success } from "../../../../shared/core/result";
import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";

export type SetLlmCredentialParams = {
  userId: string;
  repoId: string;
  apiKey: string;
};

export type SetLlmCredentialError = "repo_not_found";

export class SetLlmCredentialUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly credentialRepository: CredentialRepository,
  ) {}

  async execute(
    params: SetLlmCredentialParams,
  ): Promise<Result<Credential, SetLlmCredentialError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    const existing = await this.credentialRepository.findByRepoIdAndType(params.repoId, "llm");
    const encryptedSecret = encrypt(params.apiKey);

    // UNIQUE(repoId, type) — replace the existing row instead of inserting
    // a second one when this repo already has an llm credential.
    const credential = existing
      ? Credential.fromPersistence({
          id: existing.id.value,
          repoId: params.repoId,
          type: "llm",
          provider: "gemini",
          encryptedSecret,
          secretHash: null,
          scopes: existing.scopes,
          lastValidatedAt: existing.lastValidatedAt,
          createdAt: existing.createdAt,
          updatedAt: new Date(),
        })
      : Credential.createEncrypted({
          repoId: params.repoId,
          type: "llm",
          provider: "gemini",
          encryptedSecret,
        });

    await this.credentialRepository.save(credential);

    return success(credential);
  }
}
