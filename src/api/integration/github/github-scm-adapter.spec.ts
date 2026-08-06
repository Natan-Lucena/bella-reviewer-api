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
        suggestedCode: null,
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

    it("appends a suggestion fence to the body when suggestedCode is present", async () => {
      requestMock.mockResolvedValueOnce(jsonResponse({ id: 987655 }));
      const adapter = new GithubScmAdapter("gh-token");

      await adapter.publishComment({
        repoFullName: "org/repo",
        prNumber: 7,
        commitSha: "sha123",
        file: "src/a.ts",
        line: 10,
        body: "Off-by-one.",
        suggestedCode: "return items[i - 1];",
      });

      const config = requestMock.mock.calls[0][0];
      expect(config.data).toEqual({
        body: "Off-by-one.\n\n```suggestion\nreturn items[i - 1];\n```",
        commit_id: "sha123",
        path: "src/a.ts",
        line: 10,
      });
    });

    it("widens the fence when suggestedCode itself contains a triple-backtick run, so it can't prematurely close it", async () => {
      requestMock.mockResolvedValueOnce(jsonResponse({ id: 987656 }));
      const adapter = new GithubScmAdapter("gh-token");
      const suggestedCode = "Example:\n```js\nconsole.log(1);\n```";

      await adapter.publishComment({
        repoFullName: "org/repo",
        prNumber: 7,
        commitSha: "sha123",
        file: "README.md",
        line: 10,
        body: "Fix the example.",
        suggestedCode,
      });

      const config = requestMock.mock.calls[0][0];
      expect(config.data.body).toBe(
        `Fix the example.\n\n\`\`\`\`suggestion\n${suggestedCode}\n\`\`\`\``,
      );
    });
  });

  describe("getFileContent", () => {
    it("decodes the base64 content GitHub returns", async () => {
      requestMock.mockResolvedValueOnce(
        jsonResponse({
          content: Buffer.from("return x;\n").toString("base64"),
          encoding: "base64",
        }),
      );
      const adapter = new GithubScmAdapter("gh-token");

      const content = await adapter.getFileContent({
        repoFullName: "org/repo",
        ref: "abc123",
        path: "src/a.ts",
      });

      expect(content).toBe("return x;\n");
      expect(requestMock.mock.calls[0][0].url).toBe("/repos/org/repo/contents/src/a.ts?ref=abc123");
    });

    it("returns null (not an error) when the file doesn't exist at that ref", async () => {
      requestMock.mockRejectedValueOnce(httpError(404, "Not Found"));
      const adapter = new GithubScmAdapter("gh-token");

      const content = await adapter.getFileContent({
        repoFullName: "org/repo",
        ref: "abc123",
        path: "src/deleted.ts",
      });

      expect(content).toBeNull();
    });

    it("still throws for a non-404 error", async () => {
      requestMock.mockRejectedValue(httpError(401, "Bad credentials"));
      const adapter = new GithubScmAdapter("gh-token");

      await expect(
        adapter.getFileContent({ repoFullName: "org/repo", ref: "abc123", path: "src/a.ts" }),
      ).rejects.toBeInstanceOf(GithubScmAdapterError);
    });

    it("URL-encodes path segments", async () => {
      requestMock.mockResolvedValueOnce(
        jsonResponse({ content: Buffer.from("x").toString("base64"), encoding: "base64" }),
      );
      const adapter = new GithubScmAdapter("gh-token");

      await adapter.getFileContent({
        repoFullName: "org/repo",
        ref: "abc123",
        path: "src/a b.ts",
      });

      expect(requestMock.mock.calls[0][0].url).toBe(
        "/repos/org/repo/contents/src/a%20b.ts?ref=abc123",
      );
    });
  });

  describe("compareCommits", () => {
    it("maps commits and the union of changed files", async () => {
      requestMock.mockResolvedValueOnce(
        jsonResponse({
          commits: [
            { sha: "sha1", commit: { message: "Update src/a.ts" } },
            { sha: "sha2", commit: { message: "Fix typo" } },
          ],
          files: [{ filename: "src/a.ts" }, { filename: "src/b.ts" }],
        }),
      );
      const adapter = new GithubScmAdapter("gh-token");

      const comparison = await adapter.compareCommits({
        repoFullName: "org/repo",
        base: "before-sha",
        head: "after-sha",
      });

      expect(comparison).toEqual({
        commits: [
          { sha: "sha1", message: "Update src/a.ts" },
          { sha: "sha2", message: "Fix typo" },
        ],
        changedFiles: ["src/a.ts", "src/b.ts"],
      });
      expect(requestMock.mock.calls[0][0].url).toBe(
        "/repos/org/repo/compare/before-sha...after-sha",
      );
    });

    it("returns an empty changedFiles array when the response has no files field", async () => {
      requestMock.mockResolvedValueOnce(jsonResponse({ commits: [] }));
      const adapter = new GithubScmAdapter("gh-token");

      const comparison = await adapter.compareCommits({
        repoFullName: "org/repo",
        base: "before-sha",
        head: "after-sha",
      });

      expect(comparison.changedFiles).toEqual([]);
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

  describe("listRepos", () => {
    it("maps GitHub's repo shape and paginates until a short page", async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => ({
        full_name: `org/repo-${i}`,
        private: false,
        default_branch: "main",
      }));
      const lastPage = [{ full_name: "org/repo-100", private: true, default_branch: "trunk" }];
      requestMock
        .mockResolvedValueOnce(jsonResponse(fullPage))
        .mockResolvedValueOnce(jsonResponse(lastPage));
      const adapter = new GithubScmAdapter("gh-token");

      const repos = await adapter.listRepos();

      expect(repos).toHaveLength(101);
      expect(repos[100]).toEqual({
        fullName: "org/repo-100",
        private: true,
        defaultBranch: "trunk",
      });
      expect(requestMock.mock.calls[0][0].url).toContain("/user/repos");
      expect(requestMock.mock.calls[0][0].url).toContain("page=1");
      expect(requestMock.mock.calls[1][0].url).toContain("page=2");
    });
  });

  describe("openWorkflowInstallationPr", () => {
    function mockFreshInstall() {
      requestMock.mockImplementation((config: { url: string; method?: string }) => {
        if (config.url === "/repos/org/repo") {
          return Promise.resolve(jsonResponse({ default_branch: "main" }));
        }
        if (config.url.startsWith("/repos/org/repo/pulls?")) {
          return Promise.resolve(jsonResponse([])); // no existing PR yet
        }
        if (config.url === "/repos/org/repo/git/refs/heads/bella-reviewer/install-action") {
          return Promise.reject(httpError(404, "Not Found")); // branch doesn't exist yet
        }
        if (config.url === "/repos/org/repo/git/refs/heads/main") {
          return Promise.resolve(jsonResponse({ object: { sha: "base-sha" } }));
        }
        if (config.url === "/repos/org/repo/git/refs" && config.method === "POST") {
          return Promise.resolve(jsonResponse({}));
        }
        if (config.url.startsWith("/repos/org/repo/contents/") && !config.method) {
          return Promise.reject(httpError(404, "Not Found")); // file doesn't exist yet
        }
        if (config.url.startsWith("/repos/org/repo/contents/") && config.method === "PUT") {
          return Promise.resolve(jsonResponse({}));
        }
        if (config.url === "/repos/org/repo/pulls" && config.method === "POST") {
          return Promise.resolve(jsonResponse({ html_url: "https://github.com/org/repo/pull/1" }));
        }
        throw new Error(`Unexpected request in test: ${config.method ?? "GET"} ${config.url}`);
      });
    }

    it("creates the branch, the workflow file, and opens a PR from scratch", async () => {
      mockFreshInstall();
      const adapter = new GithubScmAdapter("gh-token");

      const result = await adapter.openWorkflowInstallationPr({ repoFullName: "org/repo" });

      expect(result).toEqual({ prUrl: "https://github.com/org/repo/pull/1" });
      const createBranchCall = requestMock.mock.calls.find(
        (call) => call[0].url === "/repos/org/repo/git/refs" && call[0].method === "POST",
      );
      expect(createBranchCall?.[0].data).toEqual({
        ref: "refs/heads/bella-reviewer/install-action",
        sha: "base-sha",
      });
      const putFileCall = requestMock.mock.calls.find(
        (call) => call[0].method === "PUT" && call[0].url.startsWith("/repos/org/repo/contents/"),
      );
      expect(putFileCall?.[0].data.branch).toBe("bella-reviewer/install-action");
      expect(putFileCall?.[0].data.sha).toBeUndefined();
      const openPrCall = requestMock.mock.calls.find(
        (call) => call[0].url === "/repos/org/repo/pulls" && call[0].method === "POST",
      );
      expect(openPrCall?.[0].data).toMatchObject({
        head: "bella-reviewer/install-action",
        base: "main",
      });
    });

    it("reuses an already-open PR instead of creating a branch or a second PR", async () => {
      requestMock.mockImplementation((config: { url: string; method?: string }) => {
        if (config.url === "/repos/org/repo") {
          return Promise.resolve(jsonResponse({ default_branch: "main" }));
        }
        if (config.url.startsWith("/repos/org/repo/pulls?")) {
          return Promise.resolve(
            jsonResponse([{ html_url: "https://github.com/org/repo/pull/7" }]),
          );
        }
        throw new Error(`Unexpected request in test: ${config.method ?? "GET"} ${config.url}`);
      });
      const adapter = new GithubScmAdapter("gh-token");

      const result = await adapter.openWorkflowInstallationPr({ repoFullName: "org/repo" });

      expect(result).toEqual({ prUrl: "https://github.com/org/repo/pull/7" });
      expect(requestMock).toHaveBeenCalledTimes(2); // repo info + PR lookup only
    });

    it("reuses an already-created branch instead of failing on a second attempt", async () => {
      requestMock.mockImplementation((config: { url: string; method?: string }) => {
        if (config.url === "/repos/org/repo") {
          return Promise.resolve(jsonResponse({ default_branch: "main" }));
        }
        if (config.url.startsWith("/repos/org/repo/pulls?")) {
          return Promise.resolve(jsonResponse([]));
        }
        if (config.url === "/repos/org/repo/git/refs/heads/bella-reviewer/install-action") {
          return Promise.resolve(jsonResponse({})); // branch already exists
        }
        if (config.url.startsWith("/repos/org/repo/contents/") && !config.method) {
          return Promise.reject(httpError(404, "Not Found"));
        }
        if (config.url.startsWith("/repos/org/repo/contents/") && config.method === "PUT") {
          return Promise.resolve(jsonResponse({}));
        }
        if (config.url === "/repos/org/repo/pulls" && config.method === "POST") {
          return Promise.resolve(jsonResponse({ html_url: "https://github.com/org/repo/pull/1" }));
        }
        throw new Error(`Unexpected request in test: ${config.method ?? "GET"} ${config.url}`);
      });
      const adapter = new GithubScmAdapter("gh-token");

      const result = await adapter.openWorkflowInstallationPr({ repoFullName: "org/repo" });

      expect(result).toEqual({ prUrl: "https://github.com/org/repo/pull/1" });
      const createBranchCall = requestMock.mock.calls.find(
        (call) => call[0].url === "/repos/org/repo/git/refs" && call[0].method === "POST",
      );
      expect(createBranchCall).toBeUndefined();
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
          suggestedCode: null,
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
