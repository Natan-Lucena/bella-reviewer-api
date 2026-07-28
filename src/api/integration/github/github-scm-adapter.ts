import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

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
            body: params.body,
            commit_id: params.commitSha,
            path: params.file,
            line: params.line,
          },
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
