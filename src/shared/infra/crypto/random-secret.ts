import { randomBytes } from "node:crypto";

// Used to generate the BELLA_TOKEN (action_token) and the webhook_secret on
// first creation. See backend-prds/05-credenciais-gatilho.md.
const SECRET_LENGTH_BYTES = 32;

export function generateRandomSecret(): string {
  return randomBytes(SECRET_LENGTH_BYTES).toString("base64url");
}
