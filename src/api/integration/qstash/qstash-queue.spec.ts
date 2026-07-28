import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QstashQueueError } from "./qstash-error";
import { QstashQueue } from "./qstash-queue";

vi.mock("axios", () => ({
  default: { create: vi.fn() },
}));

function httpError(status: number, message: string) {
  return {
    response: { status, data: { message } },
    message: `Request failed with status code ${status}`,
  };
}

describe("QstashQueue", () => {
  const requestMock = vi.fn();

  beforeEach(() => {
    requestMock.mockReset();
    vi.mocked(axios.create).mockReturnValue({
      request: requestMock,
    } as unknown as ReturnType<typeof axios.create>);
  });

  it("publishes to the destination appended directly (not URL-encoded) with the bearer token", async () => {
    requestMock.mockResolvedValueOnce({ data: { messageId: "msg-1" } });
    const queue = new QstashQueue("qstash-token", "https://qstash.upstash.io");

    await queue.publish({
      url: "https://backend.example.com/internal/review-runs/abc/process",
      body: { diff: { files: [] } },
    });

    const config = requestMock.mock.calls[0][0];
    expect(config.url).toBe(
      "https://qstash.upstash.io/v2/publish/https://backend.example.com/internal/review-runs/abc/process",
    );
    expect(config.method).toBe("POST");
    expect(config.headers.Authorization).toBe("Bearer qstash-token");
    expect(config.data).toEqual({ diff: { files: [] } });
  });

  it("forwards caller-supplied headers with the Upstash-Forward- prefix", async () => {
    requestMock.mockResolvedValueOnce({ data: { messageId: "msg-1" } });
    const queue = new QstashQueue("qstash-token", "https://qstash.upstash.io");

    await queue.publish({
      url: "https://backend.example.com/internal/review-runs/abc/process",
      body: {},
      headers: { Authorization: "Bearer internal-secret" },
    });

    const config = requestMock.mock.calls[0][0];
    expect(config.headers["Upstash-Forward-Authorization"]).toBe("Bearer internal-secret");
    // The queue's own auth header is never overwritten by a forwarded one.
    expect(config.headers.Authorization).toBe("Bearer qstash-token");
  });

  describe("error handling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("retries a 503 and succeeds on the second attempt", async () => {
      requestMock
        .mockRejectedValueOnce(httpError(503, "Service unavailable"))
        .mockResolvedValueOnce({ data: { messageId: "msg-1" } });
      const queue = new QstashQueue("qstash-token", "https://qstash.upstash.io");

      const pending = queue.publish({ url: "https://backend.example.com/x", body: {} });
      await vi.runAllTimersAsync();
      await pending;

      expect(requestMock).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("fails immediately on a 401, without retrying", async () => {
      requestMock.mockRejectedValue(httpError(401, "Invalid token"));
      const queue = new QstashQueue("qstash-token", "https://qstash.upstash.io");

      const caught = queue
        .publish({ url: "https://backend.example.com/x", body: {} })
        .catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toBeInstanceOf(QstashQueueError);
      expect(error).toMatchObject({ type: "permanent", statusCode: 401 });
      expect(requestMock).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });
});
