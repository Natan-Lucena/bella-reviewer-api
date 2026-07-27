import { config } from "../../../config";

// Loaded and validated once, at import time — fail fast at startup, never
// on the first encrypt()/decrypt() call.
const KEY_LENGTH_BYTES = 32;

function loadMasterKey(): Buffer {
  const decoded = Buffer.from(config.MASTER_KEY, "base64");
  if (decoded.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `MASTER_KEY must decode (base64) to ${KEY_LENGTH_BYTES} bytes, got ${decoded.length}. ` +
        "Generate one with: openssl rand -base64 32",
    );
  }
  return decoded;
}

export const masterKey = loadMasterKey();
