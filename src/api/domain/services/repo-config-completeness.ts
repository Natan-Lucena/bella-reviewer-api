import { Credential, CredentialType } from "../entities/credential.entity";

const REQUIRED_CREDENTIAL_TYPES: CredentialType[] = [
  "llm",
  "scm",
  "action_token",
  "webhook_secret",
];

export function isConfigComplete(credentials: Credential[]): boolean {
  const configuredTypes = new Set(credentials.map((credential) => credential.type));
  return REQUIRED_CREDENTIAL_TYPES.every((type) => configuredTypes.has(type));
}

export type ServiceState = "active" | "configuration_pending" | "inactive";

export function getServiceState(repoActive: boolean, configComplete: boolean): ServiceState {
  if (!repoActive) {
    return "inactive";
  }
  return configComplete ? "active" : "configuration_pending";
}
