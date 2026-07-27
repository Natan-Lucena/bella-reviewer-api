import { createHash, timingSafeEqual } from "node:crypto";

// Irreversible — used only for action_token (Credential.secretHash).

export function hash(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function verifyHash(plaintext: string, storedHash: string): boolean {
  const computed = Buffer.from(hash(plaintext), "hex");
  const stored = Buffer.from(storedHash, "hex");

  // timingSafeEqual throws on a length mismatch instead of returning false,
  // so guard for it explicitly — a length mismatch just means "not equal".
  if (computed.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(computed, stored);
}
