import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GithubScmAdapterError } from "./github-error";
import { GithubScmAdapter } from "./github-scm-adapter";

vi.mock("axios", () => ({
  default: { create: vi.fn() },
}));

function jsonResponse(data: unknown) {
  return { data };
}

function httpError(status: number, message: string) {
  return {
    response: { status, data: { message } },
    message: `Request failed with status code ${status}`,
  };
}

describe("GithubScmAdapter", () => {
  const requestMock = vi.fn();

  beforeEach(() => {
    requestMock.mockReset();
    vi.mocked(axios.create).mockReturnValue({
      request: requestMock,
    } as unknown as ReturnType<typeof axios.create>);
  });

  it("configures the axios instance with the bearer token and required GitHub headers", () => {
    new GithubScmAdapter("gh-secret-token");

    const config = vi.mocked(axios.create).mock.calls[0][0];
    expect(config?.baseURL).toBe("https://api.github.com");
    expect(config?.headers?.Authorization).toBe("Bearer gh-secret-token");
    expect(config?.headers?.["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  describe("getDiff", () => {
    it("parses files into a structured Diff, skipping files with no patch", async () => {
      requestMock.mockResolvedValueOnce(
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
      requestMock
        .mockResolvedValueOnce(jsonResponse(fullPage))
        .mockResolvedValueOnce(jsonResponse(lastPage));
      const adapter = new GithubScmAdapter("gh-token");

      const diff = await adapter.getDiff({
        repoFullName: "org/repo",
        prNumber: 1,
        commitSha: "sha",
      });

      expect(diff.files).toHaveLength(101);
      expect(requestMock).toHaveBeenCalledTimes(2);
      expect(requestMock.mock.calls[0][0].url).toContain("page=1");
      expect(requestMock.mock.calls[1][0].url).toContain("page=2");
    });
  });

  describe("publishComment", () => {
    it("posts the comment and maps the returned id to externalId", async () => {
      requestMock.mockResolvedValueOnce(jsonResponse({ id: 987654 }));
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
      const config = requestMock.mock.calls[0][0];
      expect(config.url).toBe("/repos/org/repo/pulls/7/comments");
      expect(config.method).toBe("POST");
      expect(config.data).toEqual({
        body: "Consider renaming this variable.",
        commit_id: "sha123",
        path: "src/a.ts",
        line: 10,
      });
    });
  });

  describe("publishGeneralComment", () => {
    it("posts to the issue-comments endpoint, not pulls/comments", async () => {
      requestMock.mockResolvedValueOnce(jsonResponse({ id: 1 }));
      const adapter = new GithubScmAdapter("gh-token");

      await adapter.publishGeneralComment({
        repoFullName: "org/repo",
        prNumber: 7,
        body: "🐾 Oi! Aqui é a Bella.",
      });

      const config = requestMock.mock.calls[0][0];
      expect(config.url).toBe("/repos/org/repo/issues/7/comments");
      expect(config.method).toBe("POST");
      expect(config.data).toEqual({ body: "🐾 Oi! Aqui é a Bella." });
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("retries a 503 and succeeds on the second attempt", async () => {
      requestMock
        .mockRejectedValueOnce(httpError(503, "Service unavailable"))
        .mockResolvedValueOnce(jsonResponse([]));
      const adapter = new GithubScmAdapter("gh-token");

      const pending = adapter.getDiff({ repoFullName: "org/repo", prNumber: 1, commitSha: "sha" });
      await vi.runAllTimersAsync();
      const diff = await pending;

      expect(diff.files).toEqual([]);
      expect(requestMock).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("fails immediately on a 401, without retrying", async () => {
      requestMock.mockRejectedValue(httpError(401, "Bad credentials"));
      const adapter = new GithubScmAdapter("gh-token");

      const caught = adapter
        .getDiff({ repoFullName: "org/repo", prNumber: 1, commitSha: "sha" })
        .catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await caught;

      expect(error).toBeInstanceOf(GithubScmAdapterError);
      expect(error).toMatchObject({ type: "permanent", statusCode: 401 });
      expect(requestMock).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it("classifies a 422 (e.g. duplicate comment) as permanent when publishing", async () => {
      requestMock.mockRejectedValue(httpError(422, "Unprocessable Entity"));
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
      expect(requestMock).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });
});
