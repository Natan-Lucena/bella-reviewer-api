import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { Comment } from "../../../domain/entities/comment.entity";
import { QueuePort } from "../../../domain/ports/queue.port";
import { CommentReplyRepository } from "../../../domain/repository/comment-reply.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { IngestCommentReplyUseCase } from "./ingest-comment-reply-use-case";
import { IngestActionCommentReplyController } from "./ingest-action-comment-reply-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function validBody() {
  return {
    prNumber: 42,
    commitSha: "abc123",
    commentId: 111,
    inReplyToId: 999,
    humanBody: "Why is this needed?",
    humanAuthor: "human-dev",
    prTitle: "Fix bug",
    prDescription: "Details.",
  };
}

function makeBellaComment(): Comment {
  const comment = Comment.create({
    reviewRunId: "review-run-1",
    reviewTurnId: "review-turn-1",
    file: "src/index.ts",
    line: 10,
    category: "bug",
    severity: "medium",
    body: "Consider handling this edge case.",
    kind: "observation",
  });
  comment.externalId = "999";
  return comment;
}

function makeDeps() {
  const commentRepository = mock<CommentRepository>();
  const commentReplyRepository = mock<CommentReplyRepository>();
  const queue = mock<QueuePort>();
  const useCase = new IngestCommentReplyUseCase(commentRepository, commentReplyRepository, queue);
  return { useCase, commentRepository, commentReplyRepository, queue };
}

describe("IngestActionCommentReplyController", () => {
  it("returns 400 when the body is missing required fields", async () => {
    const { useCase } = makeDeps();
    const controller = new IngestActionCommentReplyController(useCase);
    const req = { body: {}, repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "validation_error" }) }),
    );
  });

  it("returns 400 when prDescription is missing (nullable, not optional)", async () => {
    const { useCase } = makeDeps();
    const controller = new IngestActionCommentReplyController(useCase);
    const body: Record<string, unknown> = validBody();
    delete body.prDescription;
    const req = { body, repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 200 with { kind: 'ignored' } when the thread did not start with a Bella comment", async () => {
    const { useCase, commentRepository, commentReplyRepository } = makeDeps();
    commentReplyRepository.findByHumanExternalId.mockResolvedValue(null);
    commentRepository.findByExternalId.mockResolvedValue(null);
    const controller = new IngestActionCommentReplyController(useCase);
    const req = { body: validBody(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ kind: "ignored" });
  });

  it("returns 200 with { kind: 'accepted', commentReply } for a valid new reply", async () => {
    const { useCase, commentRepository, commentReplyRepository } = makeDeps();
    const bellaComment = makeBellaComment();
    commentReplyRepository.findByHumanExternalId.mockResolvedValue(null);
    commentRepository.findByExternalId.mockResolvedValue(bellaComment);
    commentReplyRepository.countByCommentId.mockResolvedValue(0);
    const controller = new IngestActionCommentReplyController(useCase);
    const req = { body: validBody(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.kind).toBe("accepted");
    expect(body.commentReply.humanBody).toBe(validBody().humanBody);
    expect(commentReplyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: bellaComment.id.value }),
    );
  });

  it("passes repoId from the middleware, not from the body", async () => {
    const { useCase, commentRepository, commentReplyRepository, queue } = makeDeps();
    const bellaComment = makeBellaComment();
    commentReplyRepository.findByHumanExternalId.mockResolvedValue(null);
    commentRepository.findByExternalId.mockResolvedValue(bellaComment);
    commentReplyRepository.countByCommentId.mockResolvedValue(0);
    const controller = new IngestActionCommentReplyController(useCase);
    const req = {
      body: { ...validBody(), repoId: "should-be-ignored" },
      repoId: "repo-from-middleware",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(queue.publish).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
