import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withQstashRetry } from "./qstash-retry";

describe("withQstashRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the result on the first successful attempt, without waiting", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withQstashRetry(fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient error with exponential backoff until it succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce("ok");

    const pending = withQstashRetry(fn, { attempts: 3, baseDelayMs: 1000 });
    await vi.runAllTimersAsync();

    expect(await pending).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a permanent error", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 401 });

    const caught = withQstashRetry(fn, { attempts: 3, baseDelayMs: 1000 }).catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();

    expect(await caught).toEqual({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up and throws the last error once attempts are exhausted", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });

    const caught = withQstashRetry(fn, { attempts: 3, baseDelayMs: 1000 }).catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();

    expect(await caught).toEqual({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
