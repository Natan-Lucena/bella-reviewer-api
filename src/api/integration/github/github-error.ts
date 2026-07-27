export type GithubErrorType = "transient" | "permanent";

// Carries enough for the caller (the publishing use case, later) to decide
// whether an attempt to read a diff or publish a comment failed in a
// recoverable way, and to log the reason without crashing the service.
export class GithubScmAdapterError extends Error {
  constructor(
    public readonly type: GithubErrorType,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "GithubScmAdapterError";
  }
}

// Worth a retry: rate limiting and the provider's own transient failures.
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

function extractStatus(error: unknown): number | undefined {
  const status = (error as { status?: number })?.status;
  return typeof status === "number" ? status : undefined;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const message = (error as { message?: string })?.message;
  return typeof message === "string" ? message : String(error);
}

export type GithubErrorClassification = {
  type: GithubErrorType;
  statusCode: number;
  message: string;
};

// Classifies a raw error from a GitHub API call. Anything with a status code
// GitHub itself uses for overload/rate-limit is transient; every other status
// (401/403 bad credentials, 404 PR/line gone, 422 unprocessable, or any other
// code) is permanent. A request that never got an HTTP response at all
// (network error, our own request timeout aborting it) falls back to
// matching the error message, since those still deserve a retry.
export function classifyGithubError(error: unknown): GithubErrorClassification {
  const status = extractStatus(error);
  const message = extractMessage(error);

  if (status !== undefined) {
    return {
      type: TRANSIENT_STATUS.has(status) ? "transient" : "permanent",
      statusCode: status,
      message,
    };
  }

  const looksTransient = /timeout|timed out|aborted|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i.test(
    message,
  );
  return { type: looksTransient ? "transient" : "permanent", statusCode: 0, message };
}
