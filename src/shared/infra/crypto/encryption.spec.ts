import { describe, expect, it, vi } from "vitest";

import { decrypt, encrypt } from "./encryption";

describe("encryption", () => {
  it("decrypt(encrypt(x)) === x for any string", () => {
    const samples = ["", "short", "a very very long secret ".repeat(50), "sp3ci@l ch@rs !#$%^&*()"];

    for (const plaintext of samples) {
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    }
  });

  it("never reuses the IV — the same plaintext encrypts differently every time", () => {
    const plaintext = "same-secret";

    const first = encrypt(plaintext);
    const second = encrypt(plaintext);

    expect(first).not.toBe(second);
    // both still decrypt back to the original value
    expect(decrypt(first)).toBe(plaintext);
    expect(decrypt(second)).toBe(plaintext);
  });

  it("throws when the stored value has been tampered with", () => {
    const stored = encrypt("a secret value");
    const tampered = Buffer.from(stored, "base64");
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;

    expect(() => decrypt(tampered.toString("base64"))).toThrow();
  });

  it("throws on a completely malformed stored value", () => {
    expect(() => decrypt("not-valid-base64-ciphertext")).toThrow();
  });

  it("never logs the plaintext it receives", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const secret = "super-secret-plaintext-marker";
    const stored = encrypt(secret);
    decrypt(stored);

    for (const spy of [logSpy, errorSpy, warnSpy]) {
      for (const call of spy.mock.calls) {
        expect(call.join(" ")).not.toContain(secret);
      }
    }

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
