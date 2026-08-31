import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { CommentReply } from "../../../domain/entities/comment-reply.entity";
import { IngestCommentReplyController } from "./ingest-comment-reply-controller";
import { IngestCommentReplyUseCase } from "./ingest-comment-reply-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createdPayload(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      action: "created",
      comment: {
        id: 111,
        in_reply_to_id: 999,
        body: "Why is this needed?",
        user: { login: "human-dev" },
      },
      pull_request: {
        number: 42,
        title: "Add feature",
        body: "PR description",
        head: { sha: "head-sha" },
      },
      repository: { full_name: "org/repo" },
      ...overrides,
    }),
  );
}

function makeUseCase(): IngestCommentReplyUseCase {
  return mock<IngestCommentReplyUseCase>();
}

function makeCommentReply(): CommentReply {
  return CommentReply.create({
    commentId: "comment-1",
    humanExternalId: "111",
    humanBody: "Why is this needed?",
    humanAuthor: "human-dev",
  });
}

describe("IngestCommentReplyController", () => {
  it("returns 400 when the body isn't valid JSON", async () => {
    const controller = new IngestCommentReplyController(makeUseCase());
    const req = { body: Buffer.from("not json"), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "invalid_payload" }) }),
    );
  });

  it("returns 202 with { ignored: true } for an action other than created, without calling the use case", async () => {
    const useCase = makeUseCase();
    const controller = new IngestCommentReplyController(useCase);
    const req = {
      body: createdPayload({ action: "edited" }),
      repoId: "repo-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ ignored: true });
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it("returns 400 when a created payload fails schema validation", async () => {
    const controller = new IngestCommentReplyController(makeUseCase());
    const req = {
      body: Buffer.from(JSON.stringify({ action: "created", repository: { full_name: "org/repo" } })),
      repoId: "repo-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 202 with { ignored: true } when the comment has no in_reply_to_id, without calling the use case", async () => {
    const useCase = makeUseCase();
    const controller = new IngestCommentReplyController(useCase);
    const req = {
      body: createdPayload({
        comment: { id: 111, body: "Top-level comment", user: { login: "human-dev" } },
      }),
      repoId: "repo-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ ignored: true });
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it("calls the use case with the mapped fields and returns 200 with the accepted result", async () => {
    const useCase = makeUseCase();
    const commentReply = makeCommentReply();
    (useCase.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      value: { kind: "accepted", commentReply },
    });
    const controller = new IngestCommentReplyController(useCase);
    const req = { body: createdPayload(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(useCase.execute).toHaveBeenCalledWith({
      repoId: "repo-1",
      commentId: 111,
      inReplyToId: 999,
      humanBody: "Why is this needed?",
      humanAuthor: "human-dev",
      prNumber: 42,
      commitSha: "head-sha",
      prTitle: "Add feature",
      prDescription: "PR description",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      accepted: true,
      commentReply: commentReply.toJSON(),
    });
  });

  it("returns 200 with { ignored: true } when the use case ignores the reply", async () => {
    const useCase = makeUseCase();
    (useCase.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      value: { kind: "ignored" },
    });
    const controller = new IngestCommentReplyController(useCase);
    const req = { body: createdPayload(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ignored: true });
  });
});
