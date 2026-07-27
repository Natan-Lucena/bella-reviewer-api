import jwt from "jsonwebtoken";

import { config } from "../../../config";

// Signs/verifies the user session (cookie httpOnly) — see
// backend-prds/02-auth-cadastro-login-sessao.md. Uses SESSION_SECRET, a key
// separate from MASTER_KEY (shared/infra/crypto/): one signs sessions, the
// other encrypts credentials — never reuse one for the other's purpose.
const EXPIRES_IN = "7d";

export type SessionPayload = {
  userId: string;
  email: string;
};

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, config.SESSION_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifySessionToken(token: string): SessionPayload {
  return jwt.verify(token, config.SESSION_SECRET) as SessionPayload;
}
