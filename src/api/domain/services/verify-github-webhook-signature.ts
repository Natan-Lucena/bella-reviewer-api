import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";
const HEX_DIGEST_PATTERN = /^[0-9a-f]{64}$/i;

// Recomputes the HMAC-SHA256 of the raw request body with the repo's
// decrypted webhook secret and compares it, in constant time, against
// GitHub's X-Hub-Signature-256 header. Must run against the exact raw
// bytes GitHub sent — re-serializing a parsed body would produce a
// different signature even for byte-for-byte "equivalent" JSON.
export function verifyGithubWebhookSignature(
  rawBody: Buffer,
  secret: string,
  signatureHeader: string,
): boolean {
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const provided = signatureHeader.slice(SIGNATURE_PREFIX.length);
  if (!HEX_DIGEST_PATTERN.test(provided)) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
}
