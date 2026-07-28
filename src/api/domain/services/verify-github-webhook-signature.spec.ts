import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyGithubWebhookSignature } from "./verify-github-webhook-signature";

function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyGithubWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = Buffer.from(JSON.stringify({ action: "opened" }));
    const secret = "webhook-secret";

    expect(verifyGithubWebhookSignature(body, secret, sign(body, secret))).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = Buffer.from(JSON.stringify({ action: "opened" }));

    expect(verifyGithubWebhookSignature(body, "correct-secret", sign(body, "wrong-secret"))).toBe(
      false,
    );
  });

  it("rejects a signature that doesn't match because the body changed", () => {
    const secret = "webhook-secret";
    const originalBody = Buffer.from(JSON.stringify({ action: "opened" }));
    const tamperedBody = Buffer.from(JSON.stringify({ action: "closed" }));

    expect(verifyGithubWebhookSignature(tamperedBody, secret, sign(originalBody, secret))).toBe(
      false,
    );
  });

  it("rejects a header without the sha256= prefix", () => {
    const body = Buffer.from("{}");

    expect(verifyGithubWebhookSignature(body, "secret", "abc123")).toBe(false);
  });

  it("rejects a header with a malformed (non-hex) digest", () => {
    const body = Buffer.from("{}");

    expect(verifyGithubWebhookSignature(body, "secret", "sha256=not-hex!!")).toBe(false);
  });
});
