import jwt from "jsonwebtoken";

import { config } from "../../../config";

// Signs/verifies the user session (cookie httpOnly). Uses SESSION_SECRET, a
// key separate from MASTER_KEY (shared/infra/crypto/): one signs sessions,
// the other encrypts credentials — never reuse one for the other's purpose.
export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — keep in sync with EXPIRES_IN below
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
