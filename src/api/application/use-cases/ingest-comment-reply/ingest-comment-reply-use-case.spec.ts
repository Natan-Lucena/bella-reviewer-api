import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Comment } from "../../../domain/entities/comment.entity";
import { CommentReply } from "../../../domain/entities/comment-reply.entity";
import { QueuePort } from "../../../domain/ports/queue.port";
import { CommentReplyRepository } from "../../../domain/repository/comment-reply.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { IngestCommentReplyUseCase } from "./ingest-comment-reply-use-case";

function makeDeps() {
  const commentRepository = mock<CommentRepository>();
  const commentReplyRepository = mock<CommentReplyRepository>();
  const queue = mock<QueuePort>();

  const useCase = new IngestCommentReplyUseCase(commentRepository, commentReplyRepository, queue);

  return { useCase, commentRepository, commentReplyRepository, queue };
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

const baseParams = {
  repoId: "repo-1",
  commentId: 111,
  inReplyToId: 999,
  humanBody: "Why is this needed?",
  humanAuthor: "human-dev",
  prNumber: 42,
  commitSha: "abc123",
  prTitle: "Fix bug",
  prDescription: "Details.",
};

describe("IngestCommentReplyUseCase", () => {
  it("ignores a reply to a thread that did not start with a Bella comment", async () => {
    const { useCase, commentRepository, commentReplyRepository, queue } = makeDeps();
    commentReplyRepository.findByHumanExternalId.mockResolvedValue(null);
    commentRepository.findByExternalId.mockResolvedValue(null);

    const result = await useCase.execute(baseParams);

    expect(result).toEqual({ ok: true, value: { kind: "ignored" } });
    expect(commentReplyRepository.save).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });

  it("ignores a reply that was already processed (idempotency)", async () => {
    const { useCase, commentRepository, commentReplyRepository, queue } = makeDeps();
    const existingReply = CommentReply.create({
      commentId: "comment-1",
      humanExternalId: String(baseParams.commentId),
      humanBody: "Some earlier body",
      humanAuthor: "human-dev",
    });
    commentReplyRepository.findByHumanExternalId.mockResolvedValue(existingReply);

    const result = await useCase.execute(baseParams);

    expect(result).toEqual({ ok: true, value: { kind: "ignored" } });
    expect(commentRepository.findByExternalId).not.toHaveBeenCalled();
    expect(commentReplyRepository.save).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });

  it("ignores a 6th reply on a thread that already has 5 replies", async () => {
    const { useCase, commentRepository, commentReplyRepository, queue } = makeDeps();
    const bellaComment = makeBellaComment();
    commentReplyRepository.findByHumanExternalId.mockResolvedValue(null);
    commentRepository.findByExternalId.mockResolvedValue(bellaComment);
    commentReplyRepository.countByCommentId.mockResolvedValue(5);

    const result = await useCase.execute(baseParams);

    expect(result).toEqual({ ok: true, value: { kind: "ignored" } });
    expect(commentReplyRepository.save).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });

  it("saves a new CommentReply and publishes to the queue for a valid new reply", async () => {
    const { useCase, commentRepository, commentReplyRepository, queue } = makeDeps();
    const bellaComment = makeBellaComment();
    commentReplyRepository.findByHumanExternalId.mockResolvedValue(null);
    commentRepository.findByExternalId.mockResolvedValue(bellaComment);
    commentReplyRepository.countByCommentId.mockResolvedValue(0);

    const result = await useCase.execute(baseParams);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("accepted");
    if (result.value.kind !== "accepted") return;

    const { commentReply } = result.value;
    expect(commentReply.commentId).toBe(bellaComment.id.value);
    expect(commentReply.humanExternalId).toBe(String(baseParams.commentId));
    expect(commentReply.humanBody).toBe(baseParams.humanBody);
    expect(commentReply.humanAuthor).toBe(baseParams.humanAuthor);
    expect(commentReplyRepository.save).toHaveBeenCalledWith(commentReply);

    expect(queue.publish).toHaveBeenCalledTimes(1);
    const publishCall = queue.publish.mock.calls[0][0];
    expect(publishCall.url).toContain(`/internal/comment-replies/${commentReply.id.value}/process`);
    expect(publishCall.body).toEqual({
      prNumber: baseParams.prNumber,
      commitSha: baseParams.commitSha,
      prTitle: baseParams.prTitle,
      prDescription: baseParams.prDescription,
    });
    expect(publishCall.headers).toEqual({ Authorization: expect.stringMatching(/^Bearer .+/) });
  });

  it("defaults humanAuthor to an empty string when absent", async () => {
    const { useCase, commentRepository, commentReplyRepository } = makeDeps();
    const bellaComment = makeBellaComment();
    commentReplyRepository.findByHumanExternalId.mockResolvedValue(null);
    commentRepository.findByExternalId.mockResolvedValue(bellaComment);
    commentReplyRepository.countByCommentId.mockResolvedValue(0);

    const result = await useCase.execute({ ...baseParams, humanAuthor: undefined });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== "accepted") return;
    expect(result.value.commentReply.humanAuthor).toBe("");
  });

  it("is idempotent against redelivery of an already-processed human comment", async () => {
    const { useCase, commentRepository, commentReplyRepository, queue } = makeDeps();
    const bellaComment = makeBellaComment();
    const priorReply = CommentReply.create({
      commentId: bellaComment.id.value,
      humanExternalId: String(baseParams.commentId),
      humanBody: "A prior reply, possibly re-delivered by the webhook",
      humanAuthor: "human-dev",
    });
    commentReplyRepository.findByBellaExternalId.mockResolvedValue(null);
    commentReplyRepository.findByHumanExternalId.mockResolvedValue(priorReply);

    const result = await useCase.execute(baseParams);

    expect(result).toEqual({ ok: true, value: { kind: "ignored" } });
    expect(commentRepository.findByExternalId).not.toHaveBeenCalled();
    expect(commentReplyRepository.save).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });

  it("ignores a comment that Bella herself already published as a reply (loop prevention)", async () => {
    // Regression test for a real production bug: Bella has no separate bot
    // identity, so her own published replies arrive back through the exact
    // same webhook/Action path as a human's comment. Only checking
    // humanExternalId (idempotency) never catches this, because Bella's
    // output is recorded as bellaExternalId on a DIFFERENT row, never as
    // anyone's humanExternalId — without this check, Bella replies to her
    // own replies forever (observed live: 5 escalating self-replies before
    // MAX_REPLIES_PER_THREAD happened to cap it).
    const { useCase, commentRepository, commentReplyRepository, queue } = makeDeps();
    const priorReply = CommentReply.create({
      commentId: "comment-1",
      humanExternalId: "555",
      humanBody: "An earlier human message",
      humanAuthor: "human-dev",
    });
    priorReply.bellaExternalId = String(baseParams.commentId);
    commentReplyRepository.findByBellaExternalId.mockResolvedValue(priorReply);

    const result = await useCase.execute(baseParams);

    expect(result).toEqual({ ok: true, value: { kind: "ignored" } });
    expect(commentReplyRepository.findByHumanExternalId).not.toHaveBeenCalled();
    expect(commentRepository.findByExternalId).not.toHaveBeenCalled();
    expect(commentReplyRepository.save).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });
});
