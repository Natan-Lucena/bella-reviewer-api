import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_MASTER_KEY = process.env.MASTER_KEY;

afterEach(() => {
  process.env.MASTER_KEY = ORIGINAL_MASTER_KEY;
  vi.resetModules();
});

describe("master-key", () => {
  it("fails fast at import time when MASTER_KEY doesn't decode to 32 bytes", async () => {
    process.env.MASTER_KEY = Buffer.from("too-short").toString("base64");
    vi.resetModules();

    await expect(import("./master-key")).rejects.toThrow(/32 bytes/);
  });

  it("loads successfully when MASTER_KEY is a valid 32-byte base64 value", async () => {
    process.env.MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
    vi.resetModules();

    const { masterKey } = await import("./master-key");

    expect(masterKey).toHaveLength(32);
  });
});
