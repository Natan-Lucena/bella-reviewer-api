import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GithubScmAdapterError } from "./github-error";
import { GithubScmAdapter } from "./github-scm-adapter";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GithubScmAdapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getDiff", () => {
    it("parses files into a structured Diff, skipping files with no patch", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([
          { filename: "src/a.ts", patch: "@@ -1,1 +1,2 @@\n line1\n+line2" },
          { filename: "assets/logo.png" },
        ]),
      );
      const adapter = new GithubScmAdapter("gh-token");

      const diff = await adapter.getDiff({
        repoFullName: "org/repo",
        prNumber: 42,
        commitSha: "abc123",
      });

      expect(diff.files).toHaveLength(1);
      expect(diff.files[0].path).toBe("src/a.ts");
      expect(diff.files[0].hunks[0].lines).toEqual([
        { content: "line1", status: "unchanged", lineNumber: 1 },
        { content: "line2", status: "added", lineNumber: 2 },
      ]);
    });

    it("paginates until a page comes back short of the page size", async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => ({
        filename: `file-${i}.ts`,
        patch: "@@ -1,1 +1,1 @@\n-old\n+new",
      }));
      const lastPage = [{ filename: "file-100.ts", patch: "@@ -1,1 +1,1 @@\n-old\n+new" }];
      fetchMock
        .mockResolvedValueOnce(jsonResponse(fullPage))
        .mockResolvedValueOnce(jsonResponse(lastPage));
      const adapter = new GithubScmAdapter("gh-token");

      const diff = await adapter.getDiff({
        repoFullName: "org/repo",
        prNumber: 1,
        commitSha: "sha",
      });

      expect(diff.files).toHaveLength(101);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain("page=1");
      expect(fetchMock.mock.calls[1][0]).toContain("page=2");
    });

    it("sends the bearer token and required GitHub headers", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([]));
      const adapter = new GithubScmAdapter("gh-secret-token");

      await adapter.getDiff({ repoFullName: "org/repo", prNumber: 1, commitSha: "sha" });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.github.com/repos/org/repo/pulls/1/files?per_page=100&page=1");
      expect(init.headers.Authorization).toBe("Bearer gh-secret-token");
      expect(init.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    });
  });

  describe("publishComment", () => {
    it("posts the comment and maps the returned id to externalId", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 987654 }));
      const adapter = new GithubScmAdapter("gh-token");

      const result = await adapter.publishComment({
        repoFullName: "org/repo",
        prNumber: 7,
        commitSha: "sha123",
        file: "src/a.ts",
        line: 10,
        body: "Consider renaming this variable.",
      });

      expect(result).toEqual({ externalId: "987654" });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.github.com/repos/org/repo/pulls/7/comments");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        body: "Consider renaming this variable.",
        commit_id: "sha123",
        path: "src/a.ts",
        line: 10,
      });
    });
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
        .mockResolvedValueOnce(jsonResponse([]));
      const adapter = new GithubScmAdapter("gh-token");

      const pending = adapter.getDiff({ repoFullName: "org/repo", prNumber: 1, commitSha: "sha" });
      await vi.runAllTimersAsync();
      const diff = await pending;

      expect(diff.files).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("fails immediately on a 401, without retrying", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: "Bad credentials" }, 401));
      const adapter = new GithubScmAdapter("gh-token");

      const caught = adapter
        .getDiff({ repoFullName: "org/repo", prNumber: 1, commitSha: "sha" })
        .catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toBeInstanceOf(GithubScmAdapterError);
      expect(error).toMatchObject({ type: "permanent", statusCode: 401 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("classifies a 422 (e.g. duplicate comment) as permanent when publishing", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: "Unprocessable Entity" }, 422));
      const adapter = new GithubScmAdapter("gh-token");

      const caught = adapter
        .publishComment({
          repoFullName: "org/repo",
          prNumber: 1,
          commitSha: "sha",
          file: "a.ts",
          line: 1,
          body: "nit",
        })
        .catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toMatchObject({ type: "permanent", statusCode: 422 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
