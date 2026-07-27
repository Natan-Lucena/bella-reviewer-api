import { describe, expect, it } from "vitest";

import { generateRandomSecret } from "./random-secret";

describe("generateRandomSecret", () => {
  it("never repeats across 1000 consecutive calls", () => {
    const seen = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      seen.add(generateRandomSecret());
    }

    expect(seen.size).toBe(1000);
  });

  it("is safe to use as an HTTP header value (base64url, no padding/plus/slash)", () => {
    const secret = generateRandomSecret();

    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
