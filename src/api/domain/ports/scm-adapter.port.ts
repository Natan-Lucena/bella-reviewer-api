// Source control provider (SCM) contract. v1 implements only GitHub
// (src/api/integration/github/github-scm-adapter.ts). Bitbucket would
// come in as a new implementation of this same interface, without
// touching the core.

export interface ScmAdapterPort {
  getDiff(params: GetDiffParams): Promise<Diff>;
  publishComment(params: PublishCommentParams): Promise<PublishCommentResult>;
  // A comment on the PR's conversation itself, not anchored to a file/line —
  // used for the one-time welcome message (see welcome-message.ts), which
  // isn't about any specific line of the diff.
  publishGeneralComment(params: PublishGeneralCommentParams): Promise<void>;
  // Onboarding-only operations (list-github-repos/install-action use cases):
  // unlike the methods above, the token behind these two was never persisted
  // as a Credential — it's whatever the caller passed in for this one call.
  listRepos(): Promise<GithubRepoSummary[]>;
  openWorkflowInstallationPr(
    params: OpenWorkflowInstallationPrParams,
  ): Promise<OpenWorkflowInstallationPrResult>;
  // Reconciliation-only operations: reading state to check whether a
  // previously published suggestion was applied, never writing.
  getFileContent(params: GetFileContentParams): Promise<string | null>;
  compareCommits(params: CompareCommitsParams): Promise<CommitComparison>;
}

export type GetDiffParams = {
  repoFullName: string; // "organization/repository"
  prNumber: number;
  commitSha: string;
};

export type DiffLine = {
  content: string;
  status: "added" | "removed" | "unchanged";
  lineNumber: number; // line number in the NEW file
};

export type DiffHunk = {
  oldStartLine: number;
  newStartLine: number;
  lines: DiffLine[];
};

export type DiffFile = {
  path: string;
  hunks: DiffHunk[];
};

export type Diff = {
  files: DiffFile[];
};

export type PublishCommentParams = {
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  file: string;
  line: number;
  body: string;
  // The text that would replace this line — null when there is no proposed
  // replacement. Provider-agnostic: it's the concrete implementation's job
  // to decide how (or whether) to render this as an applicable suggestion.
  suggestedCode: string | null;
};

export type PublishCommentResult = {
  externalId: string;
};

export type PublishGeneralCommentParams = {
  repoFullName: string;
  prNumber: number;
  body: string;
};

export type GithubRepoSummary = {
  fullName: string;
  private: boolean;
  defaultBranch: string;
};

export type OpenWorkflowInstallationPrParams = {
  repoFullName: string;
};

export type OpenWorkflowInstallationPrResult = {
  prUrl: string;
};

export type GetFileContentParams = {
  repoFullName: string;
  ref: string; // commit SHA
  path: string;
};

export type CompareCommitsParams = {
  repoFullName: string;
  base: string; // previous SHA
  head: string; // new SHA
};

export type CommitSummary = {
  sha: string;
  message: string;
};

export type CommitComparison = {
  commits: CommitSummary[];
  changedFiles: string[]; // paths, union of every file touched in the range
};
