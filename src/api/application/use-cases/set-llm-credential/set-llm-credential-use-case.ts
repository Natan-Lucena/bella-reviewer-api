import { failure, Result, success } from "../../../../shared/core/result";
import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { LlmProvider } from "../../../domain/entities/repo-config.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";
import { getDefaultModelForProvider } from "../../../domain/services/llm-provider-catalog";

export type SetLlmCredentialParams = {
  userId: string;
  repoId: string;
  provider: LlmProvider;
  apiKey: string;
  model?: string;
};

export type SetLlmCredentialError = "repo_not_found";

export class SetLlmCredentialUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly repoConfigRepository: RepoConfigRepository,
  ) {}

  async execute(
    params: SetLlmCredentialParams,
  ): Promise<Result<Credential, SetLlmCredentialError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    // Every Repo already has a RepoConfig (created alongside it, see
    // create-repo-use-case.ts) — missing here would mean the repo itself is
    // in a state that should be impossible, same reasoning as
    // update-repo-config-use-case.ts.
    const existingConfig = await this.repoConfigRepository.findByRepoId(params.repoId);
    if (!existingConfig) {
      return failure("repo_not_found");
    }

    const existingCredential = await this.credentialRepository.findByRepoIdAndType(
      params.repoId,
      "llm",
    );
    const encryptedSecret = encrypt(params.apiKey);

    // Always the same row when one already exists (provider switch
    // included) — UNIQUE(repoId, type) means a second row for this repo's
    // llm credential would violate the schema. Only a repo with no llm
    // credential yet gets a brand new row.
    const credential = existingCredential
      ? existingCredential.rotateSecret(encryptedSecret, params.provider)
      : Credential.createLlm({ repoId: params.repoId, provider: params.provider, encryptedSecret });

    const updatedConfig = existingConfig.update({
      llmProvider: params.provider,
      model: params.model ?? getDefaultModelForProvider(params.provider),
    });

    // Sequential, never parallel (Promise.all) — credential first. If the
    // second write fails, the new credential is already persisted (the
    // right secret exists); only RepoConfig.llmProvider lags behind for an
    // instant. The reverse order would leave a window where RepoConfig
    // points at a provider whose credential was never actually saved.
    // Not wrapped in a Prisma transaction: a mismatch between the two
    // never causes silent wrong behavior — the next ReviewRun's LLM call
    // fails loudly and immediately (a secret decrypted for one provider's
    // format, handed to another provider's SDK, never authenticates), the
    // same class of visible failure ReviewRun.errorReason already exists to
    // capture. The user sees the run fail and re-saves the credential.
    await this.credentialRepository.save(credential);
    await this.repoConfigRepository.save(updatedConfig);

    return success(credential);
  }
}
