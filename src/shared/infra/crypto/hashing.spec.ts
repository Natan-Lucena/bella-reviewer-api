import { describe, expect, it } from "vitest";

import { hash, verifyHash } from "./hashing";

describe("hashing", () => {
  it("is deterministic — the same input always produces the same hash", () => {
    const value = "BELLA_TOKEN-example-value";

    expect(hash(value)).toBe(hash(value));
  });

  it("produces different hashes for different inputs", () => {
    expect(hash("token-a")).not.toBe(hash("token-b"));
  });

  it("verifyHash() is true for the matching plaintext", () => {
    const value = "correct-token";

    expect(verifyHash(value, hash(value))).toBe(true);
  });

  it("verifyHash() is false for a different plaintext", () => {
    expect(verifyHash("wrong-token", hash("correct-token"))).toBe(false);
  });

  it("verifyHash() is false (not throwing) when the stored hash has a different length", () => {
    expect(verifyHash("any-token", "not-a-real-hash")).toBe(false);
  });

  it("hash() never returns the plaintext itself", () => {
    const value = "plaintext-should-not-appear-verbatim";

    expect(hash(value)).not.toContain(value);
  });
});
