import { Credential, CredentialType } from "../entities/credential.entity";

export interface CredentialRepository {
  save(credential: Credential): Promise<void>;
  findByRepoIdAndType(repoId: string, type: CredentialType): Promise<Credential | null>;
  // Used by the action_token reverse lookup (Gap A) — searches by hash, not id.
  // See backend-prds/05-credenciais-gatilho.md.
  findByHash(secretHash: string): Promise<Credential | null>;
}
