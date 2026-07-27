import { Credential, CredentialType } from "../entities/credential.entity";

export interface CredentialRepository {
  save(credential: Credential): Promise<void>;
  findByRepoIdAndType(repoId: string, type: CredentialType): Promise<Credential | null>;
  // Used by the action_token reverse lookup — searches by hash, not id.
  findByHash(secretHash: string): Promise<Credential | null>;
}
