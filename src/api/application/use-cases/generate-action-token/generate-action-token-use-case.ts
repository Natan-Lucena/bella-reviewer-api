import { failure, Result, success } from "../../../../shared/core/result";
import { hash } from "../../../../shared/infra/crypto/hashing";
import { generateRandomSecret } from "../../../../shared/infra/crypto/random-secret";
import { Credential } from "../../../domain/entities/credential.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";

export type GenerateActionTokenParams = {
  userId: string;
  repoId: string;
};

export type GenerateActionTokenResult = {
  token: string;
};

export type GenerateActionTokenError = "repo_not_found";

export class GenerateActionTokenUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly credentialRepository: CredentialRepository,
  ) {}

  async execute(
    params: GenerateActionTokenParams,
  ): Promise<Result<GenerateActionTokenResult, GenerateActionTokenError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    // Only ever hashed, never persisted in plaintext — this is the one and
    // only moment the plaintext value exists, and the caller must show it to
    // the user now, since it can never be recovered again.
    const token = generateRandomSecret();
    const secretHash = hash(token);

    // UNIQUE(repoId, type) — replace the existing row instead of inserting a
    // second one; the old hash stops matching anything, which invalidates
    // the previous token immediately.
    const existing = await this.credentialRepository.findByRepoIdAndType(
      params.repoId,
      "action_token",
    );
    const credential = existing
      ? existing.rotateHash(secretHash)
      : Credential.createHashed({
          repoId: params.repoId,
          type: "action_token",
          provider: "github",
          secretHash,
        });

    await this.credentialRepository.save(credential);

    return success({ token });
  }
}
