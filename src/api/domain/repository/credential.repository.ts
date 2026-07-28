import { Credential, CredentialType } from "../entities/credential.entity";

export interface CredentialRepository {
  save(credential: Credential): Promise<void>;
  findByRepoIdAndType(repoId: string, type: CredentialType): Promise<Credential | null>;
  // Used by the action_token reverse lookup — searches by hash, not id.
  findByHash(secretHash: string): Promise<Credential | null>;
  // Used to compute "is this repo fully configured?" (all 4 credential
  // types present) without four separate round trips.
  findAllByRepoId(repoId: string): Promise<Credential[]>;
  // One batched query for a whole page of repos, instead of one query per
  // repo — powers the repo list's configComplete field.
  findAllByRepoIds(repoIds: string[]): Promise<Credential[]>;
}
