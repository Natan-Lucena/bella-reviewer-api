import { failure, Result, success } from "../../../../shared/core/result";
import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";

export type SetScmCredentialParams = {
  userId: string;
  repoId: string;
  pat: string;
};

export type SetScmCredentialError = "repo_not_found";

export class SetScmCredentialUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly credentialRepository: CredentialRepository,
  ) {}

  async execute(
    params: SetScmCredentialParams,
  ): Promise<Result<Credential, SetScmCredentialError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    const existing = await this.credentialRepository.findByRepoIdAndType(params.repoId, "scm");
    const encryptedSecret = encrypt(params.pat);

    // UNIQUE(repoId, type) — replace the existing row instead of inserting
    // a second one when this repo already has an scm credential.
    const credential = existing
      ? existing.rotateSecret(encryptedSecret)
      : Credential.createScm({ repoId: params.repoId, encryptedSecret });

    await this.credentialRepository.save(credential);

    return success(credential);
  }
}
