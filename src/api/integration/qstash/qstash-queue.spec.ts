import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QstashQueueError } from "./qstash-error";
import { QstashQueue } from "./qstash-queue";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("QstashQueue", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publishes to the URL-encoded destination with the bearer token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messageId: "msg-1" }));
    const queue = new QstashQueue("qstash-token", "https://qstash.upstash.io");

    await queue.publish({
      url: "https://backend.example.com/internal/review-runs/abc/process",
      body: { diff: { files: [] } },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://qstash.upstash.io/v2/publish/https%3A%2F%2Fbackend.example.com%2Finternal%2Freview-runs%2Fabc%2Fprocess",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer qstash-token");
    expect(JSON.parse(init.body as string)).toEqual({ diff: { files: [] } });
  });

  describe("error handling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries a 503 and succeeds on the second attempt", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ message: "Service unavailable" }, 503))
        .mockResolvedValueOnce(jsonResponse({ messageId: "msg-1" }));
      const queue = new QstashQueue("qstash-token", "https://qstash.upstash.io");

      const pending = queue.publish({ url: "https://backend.example.com/x", body: {} });
      await vi.runAllTimersAsync();
      await pending;

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("fails immediately on a 401, without retrying", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: "Invalid token" }, 401));
      const queue = new QstashQueue("qstash-token", "https://qstash.upstash.io");

      const caught = queue
        .publish({ url: "https://backend.example.com/x", body: {} })
        .catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toBeInstanceOf(QstashQueueError);
      expect(error).toMatchObject({ type: "permanent", statusCode: 401 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
