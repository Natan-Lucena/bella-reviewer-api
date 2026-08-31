import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

import { logger } from "../../../logger";
import {
  CommitComparison,
  CompareCommitsParams,
  Diff,
  DiffFile,
  GetDiffParams,
  GetFileContentParams,
  GithubRepoSummary,
  OpenWorkflowInstallationPrParams,
  OpenWorkflowInstallationPrResult,
  PublishCommentParams,
  PublishCommentResult,
  PublishGeneralCommentParams,
  ReplyToCommentParams,
  ReplyToCommentResult,
  ScmAdapterPort,
} from "../../domain/ports/scm-adapter.port";
import { classifyGithubError, GithubScmAdapterError } from "./github-error";
import { withGithubRetry } from "./github-retry";
import { parseUnifiedDiffPatch } from "./parse-unified-diff";

const API_BASE_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15000;
const FILES_PER_PAGE = 100;
const REPOS_PER_PAGE = 100;

// Fixed branch name: reused across calls so a second attempt (retry, or the
// user clicking the button again after a transient failure) reuses the same
// branch/PR instead of creating a duplicate.
const INSTALL_BRANCH = "bella-reviewer/install-action";
const WORKFLOW_PATH = ".github/workflows/bella-review.yml";
const WORKFLOW_CONTENT = `name: Bella Reviewer

on:
  pull_request:
    types: [opened, synchronize, reopened]
  pull_request_review_comment:
    types: [created]

jobs:
  bella-review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    steps:
      - uses: Natan-Lucena/bella-review-action@v1
        with:
          bella-token: \${{ secrets.BELLA_TOKEN }}
`;

type PullRequestFile = {
  filename: string;
  patch?: string;
};

type GithubApiRepo = {
  full_name: string;
  private: boolean;
  default_branch: string;
};

// The longest run of consecutive backticks in the text, or 0 if there are
// none — used to pick a fence long enough that suggestedCode can never
// prematurely close it (a 3-backtick fence would break if the suggested
// code itself contains ``` , e.g. a suggestion inside a Markdown file).
function longestBacktickRun(text: string): number {
  const runs = text.match(/`+/g);
  return runs ? Math.max(...runs.map((run) => run.length)) : 0;
}

// GitHub renders a review comment as a clickable "Apply suggestion" block
// purely from this markdown convention in the body — no separate API. Only
// GitHub cares about this fence; the port itself just carries suggestedCode
// as a plain string, provider-agnostic.
function formatCommentBody(body: string, suggestedCode: string | null): string {
  if (suggestedCode === null) {
    return body;
  }
  // Standard CommonMark technique for a fence that might contain its own
  // backticks: make the fence longer than the longest run inside the
  // content, so nothing in suggestedCode can be mistaken for the closing
  // fence.
  const fence = "`".repeat(Math.max(3, longestBacktickRun(suggestedCode) + 1));
  return `${body}\n\n${fence}suggestion\n${suggestedCode}\n${fence}`;
}

export class GithubScmAdapter implements ScmAdapterPort {
  private readonly http: AxiosInstance;

  constructor(private readonly token: string) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
    });
  }

  async getDiff(params: GetDiffParams): Promise<Diff> {
    try {
      const files = await withGithubRetry(() => this.fetchAllFiles(params));

      // Binary files and diffs GitHub considers too large come back without
      // a `patch` field — there's nothing to parse, so they're left out of
      // the structured diff entirely.
      const diffFiles: DiffFile[] = files
        .filter((file) => typeof file.patch === "string")
        .map((file) => ({
          path: file.filename,
          hunks: parseUnifiedDiffPatch(file.patch as string),
        }));

      return { files: diffFiles };
    } catch (error) {
      throw this.toTypedError(error);
    }
  }

  async publishComment(params: PublishCommentParams): Promise<PublishCommentResult> {
    try {
      const [owner, repo] = params.repoFullName.split("/");
      const response = await withGithubRetry(() =>
        this.request<{ id: number }>(`/repos/${owner}/${repo}/pulls/${params.prNumber}/comments`, {
          method: "POST",
          data: {
            body: formatCommentBody(params.body, params.suggestedCode),
            commit_id: params.commitSha,
            path: params.file,
            // GitHub's REST API inverts our own convention: here `line` is
            // the LAST line of the range and `start_line` is the FIRST —
            // confirmed against GitHub's own docs, not assumed (an earlier
            // unverified assumption about this exact API caused a real
            // production incident). `start_line`/`start_side` are only sent
            // for an actual multi-line range — a single-line comment
            // (params.endLine === params.line) keeps the same payload shape
            // this adapter always sent, since GitHub rejects start_line ===
            // line as an explicit range on some endpoints.
            ...(params.endLine !== params.line
              ? { start_line: params.line, start_side: "RIGHT" }
              : {}),
            line: params.endLine,
            side: "RIGHT",
          },
        }),
      );

      return { externalId: String(response.id) };
    } catch (error) {
      throw this.toTypedError(error);
    }
  }

  async replyToComment(params: ReplyToCommentParams): Promise<ReplyToCommentResult> {
    try {
      const [owner, repo] = params.repoFullName.split("/");
      const response = await withGithubRetry(() =>
        this.request<{ id: number }>(
          `/repos/${owner}/${repo}/pulls/${params.prNumber}/comments/${params.inReplyToExternalId}/replies`,
          { method: "POST", data: { body: formatCommentBody(params.body, params.suggestedCode) } },
        ),
      );
      return { externalId: String(response.id) };
    } catch (error) {
      throw this.toTypedError(error);
    }
  }

  async getFileContent(params: GetFileContentParams): Promise<string | null> {
    try {
      const [owner, repo] = params.repoFullName.split("/");
      const encodedPath = params.path.split("/").map(encodeURIComponent).join("/");
      const response = await withGithubRetry(() =>
        this.request<{ content: string; encoding: string }>(
          `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${params.ref}`,
        ),
      );

      return Buffer.from(response.content, response.encoding as BufferEncoding).toString("utf8");
    } catch (error) {
      // A 404 means the file doesn't exist at that ref (deleted, or never
      // existed there) — a legitimate outcome for the caller to reason
      // about, not a failure. Any other error still throws.
      if ((error as { status?: number })?.status === 404) {
        return null;
      }
      throw this.toTypedError(error);
    }
  }

  async compareCommits(params: CompareCommitsParams): Promise<CommitComparison> {
    try {
      const [owner, repo] = params.repoFullName.split("/");
      const response = await withGithubRetry(() =>
        this.request<{
          commits: { sha: string; commit: { message: string } }[];
          files?: { filename: string }[];
        }>(`/repos/${owner}/${repo}/compare/${params.base}...${params.head}`),
      );

      return {
        commits: response.commits.map((commit) => ({
          sha: commit.sha,
          message: commit.commit.message,
        })),
        changedFiles: (response.files ?? []).map((file) => file.filename),
      };
    } catch (error) {
      throw this.toTypedError(error);
    }
  }

  async publishGeneralComment(params: PublishGeneralCommentParams): Promise<void> {
    try {
      const [owner, repo] = params.repoFullName.split("/");
      // Issue-comments endpoint, not pulls/comments — a PR is an issue for
      // the purposes of GitHub's conversation-level comments API. Used for
      // a comment that isn't anchored to any specific file/line.
      await withGithubRetry(() =>
        this.request(`/repos/${owner}/${repo}/issues/${params.prNumber}/comments`, {
          method: "POST",
          data: { body: params.body },
        }),
      );
    } catch (error) {
      throw this.toTypedError(error);
    }
  }

  async listRepos(): Promise<GithubRepoSummary[]> {
    try {
      const repos = await withGithubRetry(() => this.fetchAllUserRepos());
      return repos.map((repo) => ({
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
      }));
    } catch (error) {
      throw this.toTypedError(error);
    }
  }

  async openWorkflowInstallationPr(
    params: OpenWorkflowInstallationPrParams,
  ): Promise<OpenWorkflowInstallationPrResult> {
    try {
      // repoFullName always comes from a persisted Repo.fullName, already
      // validated as "organization/repository" at creation — safe to assert.
      const [owner, repo] = params.repoFullName.split("/") as [string, string];
      return await withGithubRetry(() => this.installWorkflow(owner, repo));
    } catch (error) {
      throw this.toTypedError(error);
    }
  }

  private async fetchAllUserRepos(): Promise<GithubApiRepo[]> {
    const repos: GithubApiRepo[] = [];
    let page = 1;

    for (;;) {
      const pageRepos = await this.request<GithubApiRepo[]>(
        `/user/repos?per_page=${REPOS_PER_PAGE}&page=${page}&affiliation=owner,collaborator,organization_member`,
      );
      repos.push(...pageRepos);
      if (pageRepos.length < REPOS_PER_PAGE) {
        break;
      }
      page++;
    }

    return repos;
  }

  // Idempotent by construction: reuses an already-open PR from the fixed
  // branch if one exists, and reuses the branch itself if it was already
  // created by a previous (possibly failed) attempt — calling this twice in
  // a row for the same repo never creates a second branch or a duplicate PR.
  private async installWorkflow(
    owner: string,
    repo: string,
  ): Promise<OpenWorkflowInstallationPrResult> {
    const repoInfo = await this.request<{ default_branch: string }>(`/repos/${owner}/${repo}`);
    const defaultBranch = repoInfo.default_branch;

    const existingPrUrl = await this.findExistingInstallPr(owner, repo, defaultBranch);
    if (existingPrUrl) {
      return { prUrl: existingPrUrl };
    }

    await this.ensureInstallBranch(owner, repo, defaultBranch);
    await this.upsertWorkflowFile(owner, repo);

    const pr = await this.request<{ html_url: string }>(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      data: {
        title: "Instala o Bella Reviewer",
        head: INSTALL_BRANCH,
        base: defaultBranch,
        body:
          "Este PR adiciona o workflow do Bella Reviewer " +
          `(\`${WORKFLOW_PATH}\`). Depois de mergear, configure o secret ` +
          "`BELLA_TOKEN` (Repository secret, não Environment secret) nas configurações deste " +
          `repositório: https://github.com/${owner}/${repo}/settings/secrets/actions/new`,
      },
    });

    return { prUrl: pr.html_url };
  }

  private async findExistingInstallPr(
    owner: string,
    repo: string,
    defaultBranch: string,
  ): Promise<string | null> {
    try {
      const head = encodeURIComponent(`${owner}:${INSTALL_BRANCH}`);
      const prs = await this.request<{ html_url: string }[]>(
        `/repos/${owner}/${repo}/pulls?state=open&head=${head}&base=${defaultBranch}`,
      );
      return prs[0]?.html_url ?? null;
    } catch {
      return null;
    }
  }

  private async ensureInstallBranch(
    owner: string,
    repo: string,
    defaultBranch: string,
  ): Promise<void> {
    try {
      await this.request(`/repos/${owner}/${repo}/git/refs/heads/${INSTALL_BRANCH}`);
      return; // branch already exists from a previous attempt — reuse it.
    } catch {
      // Doesn't exist yet — fall through and create it below.
    }

    const baseRef = await this.request<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`,
    );

    await this.request(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      data: { ref: `refs/heads/${INSTALL_BRANCH}`, sha: baseRef.object.sha },
    });
  }

  private async upsertWorkflowFile(owner: string, repo: string): Promise<void> {
    let existingSha: string | undefined;
    try {
      const existing = await this.request<{ sha: string }>(
        `/repos/${owner}/${repo}/contents/${WORKFLOW_PATH}?ref=${INSTALL_BRANCH}`,
      );
      existingSha = existing.sha;
    } catch {
      // No file at this path on the branch yet — creating, not updating.
    }

    await this.request(`/repos/${owner}/${repo}/contents/${WORKFLOW_PATH}`, {
      method: "PUT",
      data: {
        message: "Add Bella Reviewer workflow",
        content: Buffer.from(WORKFLOW_CONTENT).toString("base64"),
        branch: INSTALL_BRANCH,
        ...(existingSha ? { sha: existingSha } : {}),
      },
    });
  }

  private async fetchAllFiles(params: GetDiffParams): Promise<PullRequestFile[]> {
    const [owner, repo] = params.repoFullName.split("/");
    const files: PullRequestFile[] = [];
    let page = 1;

    // GitHub paginates at up to 100 files per page — keep asking until a
    // page comes back short, meaning there's nothing left to fetch.
    for (;;) {
      const pageFiles = await this.request<PullRequestFile[]>(
        `/repos/${owner}/${repo}/pulls/${params.prNumber}/files?per_page=${FILES_PER_PAGE}&page=${page}`,
      );
      files.push(...pageFiles);
      if (pageFiles.length < FILES_PER_PAGE) {
        break;
      }
      page++;
    }

    return files;
  }

  private async request<T>(path: string, config: AxiosRequestConfig = {}): Promise<T> {
    try {
      const response = await this.http.request<T>({ url: path, ...config });
      return response.data;
    } catch (error) {
      // axios rejects with an error carrying a `response` property when the
      // server answered with a non-2xx status — normalized here to the same
      // {status, message} shape this adapter threw before migrating off raw
      // fetch(), so classifyGithubError needs no changes. A request that
      // never got a response at all (network error, our own timeout) has no
      // `.response` and is rethrown as-is; its `.message` still drives the
      // transient/permanent classification there.
      const axiosError = error as { response?: { status?: number; data?: { message?: string } } };
      if (axiosError?.response) {
        throw {
          status: axiosError.response.status,
          message: axiosError.response.data?.message ?? (error as Error).message,
        };
      }
      throw error;
    }
  }

  private toTypedError(error: unknown): GithubScmAdapterError {
    if (error instanceof GithubScmAdapterError) {
      return error;
    }

    const { type, statusCode, message } = classifyGithubError(error);

    // Never log params.body (the review comment text) or diff content —
    // only the provider's own error message and status.
    logger.error("GitHub API request failed", { type, statusCode, message });

    return new GithubScmAdapterError(type, statusCode, message);
  }
}
