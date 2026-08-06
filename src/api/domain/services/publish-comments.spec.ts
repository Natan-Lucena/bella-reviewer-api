import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Comment } from "../entities/comment.entity";
import type { CommentRepository } from "../repository/comment.repository";
import type { ScmAdapterPort } from "../ports/scm-adapter.port";
import { publishComments } from "./publish-comments";

function makeComment(overrides: Partial<{ file: string; line: number }> = {}): Comment {
  return Comment.create({
    reviewRunId: "review-run-1",
    reviewTurnId: "review-turn-1",
    file: overrides.file ?? "src/a.ts",
    line: overrides.line ?? 10,
    category: "bug",
    severity: "high",
    body: "This looks wrong.",
    kind: "observation",
  });
}

const baseParams = {
  repoFullName: "org/repo",
  prNumber: 42,
  commitSha: "abc123",
};

describe("publishComments", () => {
  it("publishes every generated comment and persists status/externalId", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    scmAdapter.publishComment.mockResolvedValue({ externalId: "999" });
    const commentRepository = mock<CommentRepository>();
    const comment = makeComment();

    const result = await publishComments({
      ...baseParams,
      scmAdapter,
      commentRepository,
      comments: [comment],
    });

    expect(result.errorReason).toBeUndefined();
    expect(scmAdapter.publishComment).toHaveBeenCalledWith({
      repoFullName: "org/repo",
      prNumber: 42,
      commitSha: "abc123",
      file: "src/a.ts",
      line: 10,
      body: "This looks wrong.",
    });
    expect(comment.status).toBe("published");
    expect(comment.externalId).toBe("999");
    expect(commentRepository.save).toHaveBeenCalledWith(comment);
  });

  it("skips comments that aren't in the generated status (idempotency)", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    const commentRepository = mock<CommentRepository>();
    const comment = makeComment();
    comment.status = "published";
    comment.externalId = "already-there";

    await publishComments({
      ...baseParams,
      scmAdapter,
      commentRepository,
      comments: [comment],
    });

    expect(scmAdapter.publishComment).not.toHaveBeenCalled();
    expect(commentRepository.save).not.toHaveBeenCalled();
  });

  it("calling it twice over the same comments only publishes each one once", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    scmAdapter.publishComment.mockResolvedValue({ externalId: "1" });
    const commentRepository = mock<CommentRepository>();
    const comment = makeComment();

    await publishComments({ ...baseParams, scmAdapter, commentRepository, comments: [comment] });
    await publishComments({ ...baseParams, scmAdapter, commentRepository, comments: [comment] });

    expect(scmAdapter.publishComment).toHaveBeenCalledTimes(1);
  });

  it("records the failure and keeps publishing the rest when one comment fails", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    scmAdapter.publishComment
      .mockResolvedValueOnce({ externalId: "1" })
      .mockRejectedValueOnce(new Error("403 Forbidden"))
      .mockResolvedValueOnce({ externalId: "3" });
    const commentRepository = mock<CommentRepository>();
    const comments = [
      makeComment({ file: "a.ts", line: 1 }),
      makeComment({ file: "b.ts", line: 2 }),
      makeComment({ file: "c.ts", line: 3 }),
    ];

    const result = await publishComments({
      ...baseParams,
      scmAdapter,
      commentRepository,
      comments,
    });

    expect(result.errorReason).toBe("403 Forbidden");
    expect(comments[0].status).toBe("published");
    expect(comments[1].status).toBe("generated");
    expect(comments[1].externalId).toBeNull();
    expect(comments[2].status).toBe("published");
    expect(commentRepository.save).toHaveBeenCalledTimes(3);
  });

  it("a subsequent call only retries the comment that stayed generated", async () => {
    const scmAdapter = mock<ScmAdapterPort>();
    scmAdapter.publishComment
      .mockResolvedValueOnce({ externalId: "1" })
      .mockRejectedValueOnce(new Error("timeout"));
    const commentRepository = mock<CommentRepository>();
    const comments = [
      makeComment({ file: "a.ts", line: 1 }),
      makeComment({ file: "b.ts", line: 2 }),
    ];

    await publishComments({ ...baseParams, scmAdapter, commentRepository, comments });

    scmAdapter.publishComment.mockResolvedValueOnce({ externalId: "2" });
    const secondResult = await publishComments({
      ...baseParams,
      scmAdapter,
      commentRepository,
      comments,
    });

    expect(scmAdapter.publishComment).toHaveBeenCalledTimes(3);
    expect(secondResult.errorReason).toBeUndefined();
    expect(comments[1].status).toBe("published");
    expect(comments[1].externalId).toBe("2");
  });
});
