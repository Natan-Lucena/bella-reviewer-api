import type { Credential, CredentialType } from "../entities/credential.entity";

// Looks up a single credential of a given type from an already-loaded list —
// backs the upcoming bulk credential-status endpoint, which fetches every
// credential for a repo in one query rather than one per type.
export function findCredentialByType(
  credentials: Credential[],
  type: CredentialType,
): Credential | undefined {
  return credentials.filter((credential) => credential.type === type)[0];
}
