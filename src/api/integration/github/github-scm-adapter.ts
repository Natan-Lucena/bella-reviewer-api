import { logger } from "../../../logger";
import {
  Diff,
  DiffFile,
  GetDiffParams,
  PublishCommentParams,
  PublishCommentResult,
  ScmAdapterPort,
} from "../../domain/ports/scm-adapter.port";
import { classifyGithubError, GithubScmAdapterError } from "./github-error";
import { withGithubRetry } from "./github-retry";
import { parseUnifiedDiffPatch } from "./parse-unified-diff";

const API_BASE_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15000;
const FILES_PER_PAGE = 100;

type PullRequestFile = {
  filename: string;
  patch?: string;
};

// Explicit shape asserted onto fetch()'s result — see the comment at the
// call site for why this doesn't just rely on the ambient Response type.
type FetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
};

export class GithubScmAdapter implements ScmAdapterPort {
  constructor(private readonly token: string) {}

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
          body: JSON.stringify({
            body: params.body,
            commit_id: params.commitSha,
            path: params.file,
            line: params.line,
          }),
        }),
      );

      return { externalId: String(response.id) };
    } catch (error) {
      throw this.toTypedError(error);
    }
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

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    // Cast instead of relying on the ambient `fetch`/`Response` typing: some
    // build environments resolve a narrower/incompatible global `Response`
    // (missing `ok`/`json`/`status`) than the one used locally, even with
    // identical `typescript`/`@types/node` versions — this sidesteps that
    // entirely rather than chasing the exact cause.
    const response = (await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })) as unknown as FetchResponse;

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw { status: response.status, message: body?.message ?? response.statusText };
    }

    return response.json() as Promise<T>;
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
