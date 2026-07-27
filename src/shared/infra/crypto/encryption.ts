import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { masterKey } from "./master-key";

// AES-256-GCM. Storage format: base64(iv [12 bytes] + authTag [16 bytes] + ciphertext).
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(stored: string): string {
  const buffer = Buffer.from(stored, "base64");
  const iv = buffer.subarray(0, IV_LENGTH_BYTES);
  const authTag = buffer.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const ciphertext = buffer.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

  // setAuthTag + final() throws if the tag doesn't match (corrupted or
  // tampered data, or the wrong MASTER_KEY) — never returns partial data.
  const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
