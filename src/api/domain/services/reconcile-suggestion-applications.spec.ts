import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Comment } from "../entities/comment.entity";
import type { CommentApplyEventRepository } from "../repository/comment-apply-event.repository";
import type { CommentRepository } from "../repository/comment.repository";
import type { ScmAdapterPort } from "../ports/scm-adapter.port";
import { reconcileSuggestionApplications } from "./reconcile-suggestion-applications";

function makePendingComment(
  overrides: Partial<{
    file: string;
    line: number;
    suggestedCode: string;
    contextBefore: string | null;
    contextAfter: string | null;
  }> = {},
): Comment {
  const comment = Comment.create({
    reviewRunId: "review-run-1",
    reviewTurnId: "review-turn-1",
    file: overrides.file ?? "src/a.ts",
    line: overrides.line ?? 2,
    category: "bug",
    severity: "high",
    body: "Off-by-one.",
    kind: "actionable",
    suggestedCode: overrides.suggestedCode ?? "return items[i - 1];",
    contextBefore: overrides.contextBefore ?? null,
    contextAfter: overrides.contextAfter ?? null,
  });
  comment.status = "published";
  comment.externalId = "gh-1";
  return comment;
}

const baseParams = {
  repoFullName: "org/repo",
  repoId: "repo-1",
  prNumber: 42,
  previousCommitSha: "before-sha",
  newCommitSha: "after-sha",
};

describe("reconcileSuggestionApplications", () => {
  it("does nothing (no compareCommits call) when there are no pending suggestions", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    const commentRepository = mock<CommentRepository>();
    commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([]);
    const commentApplyEventRepository = mock<CommentApplyEventRepository>();

    await reconcileSuggestionApplications({
      ...baseParams,
      scmAdapter,
      commentRepository,
      commentApplyEventRepository,
    });

    expect(scmAdapter.compareCommits).not.toHaveBeenCalled();
  });

  it("makes exactly one compareCommits call regardless of how many comments are pending", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    scmAdapter.compareCommits.mockResolvedValue({ commits: [], changedFiles: [] });
    const commentRepository = mock<CommentRepository>();
    commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([
      makePendingComment({ file: "a.ts" }),
      makePendingComment({ file: "b.ts" }),
      makePendingComment({ file: "c.ts" }),
    ]);
    const commentApplyEventRepository = mock<CommentApplyEventRepository>();

    await reconcileSuggestionApplications({
      ...baseParams,
      scmAdapter,
      commentRepository,
      commentApplyEventRepository,
    });

    expect(scmAdapter.compareCommits).toHaveBeenCalledTimes(1);
    expect(scmAdapter.compareCommits).toHaveBeenCalledWith({
      repoFullName: "org/repo",
      base: "before-sha",
      head: "after-sha",
    });
  });

  it("leaves a comment pending, with no getFileContent call, when its file wasn't touched by this push", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    scmAdapter.compareCommits.mockResolvedValue({ commits: [], changedFiles: ["other.ts"] });
    const commentRepository = mock<CommentRepository>();
    const comment = makePendingComment({ file: "a.ts" });
    commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([comment]);
    const commentApplyEventRepository = mock<CommentApplyEventRepository>();

    await reconcileSuggestionApplications({
      ...baseParams,
      scmAdapter,
      commentRepository,
      commentApplyEventRepository,
    });

    expect(scmAdapter.getFileContent).not.toHaveBeenCalled();
    expect(commentRepository.save).not.toHaveBeenCalled();
    expect(commentApplyEventRepository.save).not.toHaveBeenCalled();
  });

  it("marks superseded/file_deleted when the file no longer exists at the new commit", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    scmAdapter.compareCommits.mockResolvedValue({ commits: [], changedFiles: ["a.ts"] });
    scmAdapter.getFileContent.mockResolvedValue(null);
    const commentRepository = mock<CommentRepository>();
    const comment = makePendingComment({ file: "a.ts" });
    commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([comment]);
    const commentApplyEventRepository = mock<CommentApplyEventRepository>();

    await reconcileSuggestionApplications({
      ...baseParams,
      scmAdapter,
      commentRepository,
      commentApplyEventRepository,
    });

    const saved = commentRepository.save.mock.calls[0][0];
    expect(saved.applyStatus).toBe("superseded");
    expect(saved.detectionMethod).toBe("file_deleted");
    expect(commentApplyEventRepository.save).toHaveBeenCalledTimes(1);
    const event = commentApplyEventRepository.save.mock.calls[0][0];
    expect(event.newStatus).toBe("superseded");
    expect(event.commitSha).toBe("after-sha");
  });

  it("marks superseded/line_out_of_range when the target line no longer exists", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    scmAdapter.compareCommits.mockResolvedValue({ commits: [], changedFiles: ["a.ts"] });
    scmAdapter.getFileContent.mockResolvedValue("only one line");
    const commentRepository = mock<CommentRepository>();
    const comment = makePendingComment({ file: "a.ts", line: 5 });
    commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([comment]);
    const commentApplyEventRepository = mock<CommentApplyEventRepository>();

    await reconcileSuggestionApplications({
      ...baseParams,
      scmAdapter,
      commentRepository,
      commentApplyEventRepository,
    });

    const saved = commentRepository.save.mock.calls[0][0];
    expect(saved.applyStatus).toBe("superseded");
    expect(saved.detectionMethod).toBe("line_out_of_range");
  });

  it("marks applied_manual/content_match when the line matches suggestedCode (trimmed)", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    scmAdapter.compareCommits.mockResolvedValue({ commits: [], changedFiles: ["a.ts"] });
    scmAdapter.getFileContent.mockResolvedValue(
      "function getLast(items) {\n  return items[i - 1];  \n}",
    );
    const commentRepository = mock<CommentRepository>();
    const comment = makePendingComment({
      file: "a.ts",
      line: 2,
      suggestedCode: "return items[i - 1];",
    });
    commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([comment]);
    const commentApplyEventRepository = mock<CommentApplyEventRepository>();

    await reconcileSuggestionApplications({
      ...baseParams,
      scmAdapter,
      commentRepository,
      commentApplyEventRepository,
    });

    const saved = commentRepository.save.mock.calls[0][0];
    expect(saved.applyStatus).toBe("applied_manual");
    expect(saved.detectionMethod).toBe("content_match");
    expect(saved.appliedAt).toBeInstanceOf(Date);
    expect(saved.appliedAtCommit).toBe("after-sha");
  });

  it("leaves the comment pending, with no save, when the line doesn't match suggestedCode", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    scmAdapter.compareCommits.mockResolvedValue({ commits: [], changedFiles: ["a.ts"] });
    scmAdapter.getFileContent.mockResolvedValue("function getLast(items) {\n  return null;\n}");
    const commentRepository = mock<CommentRepository>();
    const comment = makePendingComment({
      file: "a.ts",
      line: 2,
      suggestedCode: "return items[i - 1];",
    });
    commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([comment]);
    const commentApplyEventRepository = mock<CommentApplyEventRepository>();

    await reconcileSuggestionApplications({
      ...baseParams,
      scmAdapter,
      commentRepository,
      commentApplyEventRepository,
    });

    expect(commentRepository.save).not.toHaveBeenCalled();
    expect(commentApplyEventRepository.save).not.toHaveBeenCalled();
  });

  describe("line drift (DT-01)", () => {
    it("relocates via context and marks applied_manual/content_match_relocated when unrelated lines were inserted above", async () => {
      const scmAdapter = mock<ScmAdapterPort>();
      scmAdapter.compareCommits.mockResolvedValue({ commits: [], changedFiles: ["a.ts"] });
      // 5 unrelated lines inserted above the original function — the
      // suggestion, published against line 2, is really at line 7 now.
      scmAdapter.getFileContent.mockResolvedValue(
        [
          "import a from 'a';",
          "import b from 'b';",
          "import c from 'c';",
          "import d from 'd';",
          "import e from 'e';",
          "function getLast(items) {",
          "  return items[i - 1];",
          "}",
        ].join("\n"),
      );
      const commentRepository = mock<CommentRepository>();
      const comment = makePendingComment({
        file: "a.ts",
        line: 2,
        suggestedCode: "return items[i - 1];",
        contextBefore: "function getLast(items) {",
        contextAfter: "}",
      });
      commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([comment]);
      const commentApplyEventRepository = mock<CommentApplyEventRepository>();

      await reconcileSuggestionApplications({
        ...baseParams,
        scmAdapter,
        commentRepository,
        commentApplyEventRepository,
      });

      const saved = commentRepository.save.mock.calls[0][0];
      expect(saved.applyStatus).toBe("applied_manual");
      expect(saved.detectionMethod).toBe("content_match_relocated");
    });

    it("without context (comment predates this field), a drifted line reads the wrong place and stays pending — pre-existing behavior, not a regression", async () => {
      const scmAdapter = mock<ScmAdapterPort>();
      scmAdapter.compareCommits.mockResolvedValue({ commits: [], changedFiles: ["a.ts"] });
      scmAdapter.getFileContent.mockResolvedValue(
        [
          "import a from 'a';",
          "import b from 'b';",
          "import c from 'c';",
          "import d from 'd';",
          "import e from 'e';",
          "function getLast(items) {",
          "  return items[i - 1];",
          "}",
        ].join("\n"),
      );
      const commentRepository = mock<CommentRepository>();
      const comment = makePendingComment({
        file: "a.ts",
        line: 2,
        suggestedCode: "return items[i - 1];",
        contextBefore: null,
        contextAfter: null,
      });
      commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([comment]);
      const commentApplyEventRepository = mock<CommentApplyEventRepository>();

      await reconcileSuggestionApplications({
        ...baseParams,
        scmAdapter,
        commentRepository,
        commentApplyEventRepository,
      });

      expect(commentRepository.save).not.toHaveBeenCalled();
    });

    it("stays pending (no outcome) when the line drifted and the context can't be relocated with confidence", async () => {
      const scmAdapter = mock<ScmAdapterPort>();
      scmAdapter.compareCommits.mockResolvedValue({ commits: [], changedFiles: ["a.ts"] });
      // The file changed enough that neither the original line nor any
      // unique elsewhere-position matches the stored context anymore.
      scmAdapter.getFileContent.mockResolvedValue("totally\ndifferent\nfile\ncontent");
      const commentRepository = mock<CommentRepository>();
      const comment = makePendingComment({
        file: "a.ts",
        line: 2,
        suggestedCode: "return items[i - 1];",
        contextBefore: "function getLast(items) {",
        contextAfter: "}",
      });
      commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([comment]);
      const commentApplyEventRepository = mock<CommentApplyEventRepository>();

      await reconcileSuggestionApplications({
        ...baseParams,
        scmAdapter,
        commentRepository,
        commentApplyEventRepository,
      });

      expect(commentRepository.save).not.toHaveBeenCalled();
      expect(commentApplyEventRepository.save).not.toHaveBeenCalled();
    });

    it("does not relocate (uses the original line as-is) when nothing drifted, and reports plain content_match", async () => {
      const scmAdapter = mock<ScmAdapterPort>();
      scmAdapter.compareCommits.mockResolvedValue({ commits: [], changedFiles: ["a.ts"] });
      scmAdapter.getFileContent.mockResolvedValue(
        "function getLast(items) {\n  return items[i - 1];\n}",
      );
      const commentRepository = mock<CommentRepository>();
      const comment = makePendingComment({
        file: "a.ts",
        line: 2,
        suggestedCode: "return items[i - 1];",
        contextBefore: "function getLast(items) {",
        contextAfter: "}",
      });
      commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([comment]);
      const commentApplyEventRepository = mock<CommentApplyEventRepository>();

      await reconcileSuggestionApplications({
        ...baseParams,
        scmAdapter,
        commentRepository,
        commentApplyEventRepository,
      });

      const saved = commentRepository.save.mock.calls[0][0];
      expect(saved.applyStatus).toBe("applied_manual");
      expect(saved.detectionMethod).toBe("content_match");
    });
  });
});
