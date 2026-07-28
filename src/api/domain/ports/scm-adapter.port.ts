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
};

export type PublishCommentResult = {
  externalId: string;
};

export type PublishGeneralCommentParams = {
  repoFullName: string;
  prNumber: number;
  body: string;
};
