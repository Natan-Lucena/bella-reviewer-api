import { describe, expect, it } from "vitest";

import { CommentReply } from "./comment-reply.entity";

const baseProps = {
  commentId: "comment-1",
  humanExternalId: "gh-comment-1",
  humanBody: "Why not use a Map here instead?",
  humanAuthor: "octocat",
};

describe("CommentReply.create", () => {
  it("generates a random id and createdAt", () => {
    const reply = CommentReply.create(baseProps);

    expect(reply.id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(reply.createdAt).toBeInstanceOf(Date);
  });

  it("passes the given props through unchanged", () => {
    const reply = CommentReply.create(baseProps);

    expect(reply.commentId).toBe("comment-1");
    expect(reply.humanExternalId).toBe("gh-comment-1");
    expect(reply.humanBody).toBe("Why not use a Map here instead?");
    expect(reply.humanAuthor).toBe("octocat");
  });

  it("defaults status to queued and every LLM-derived field to its not-yet-computed value", () => {
    const reply = CommentReply.create(baseProps);

    expect(reply.status).toBe("queued");
    expect(reply.category).toBeNull();
    expect(reply.errorReason).toBeNull();
    expect(reply.bellaBody).toBeNull();
    expect(reply.bellaSuggestedCode).toBeNull();
    expect(reply.bellaExternalId).toBeNull();
    expect(reply.inputTokens).toBe(0);
    expect(reply.outputTokens).toBe(0);
    expect(reply.reasoningTokens).toBe(0);
    expect(reply.estimatedCost).toBeNull();
    expect(reply.completedAt).toBeNull();
  });
});

describe("CommentReply.fromPersistence", () => {
  it("wraps the given id and passes every stored field through as-is", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const completedAt = new Date("2026-01-01T00:05:00.000Z");

    const reply = CommentReply.fromPersistence({
      id: "11111111-1111-1111-1111-111111111111",
      commentId: "comment-1",
      humanExternalId: "gh-comment-1",
      humanBody: "Why not use a Map here instead?",
      humanAuthor: "octocat",
      status: "completed",
      category: "clarification",
      errorReason: null,
      bellaBody: "Because we need insertion order guarantees here.",
      bellaSuggestedCode: null,
      bellaExternalId: "gh-comment-2",
      inputTokens: 120,
      outputTokens: 45,
      reasoningTokens: 10,
      estimatedCost: 0.0042,
      createdAt,
      completedAt,
    });

    expect(reply.id.value).toBe("11111111-1111-1111-1111-111111111111");
    expect(reply.commentId).toBe("comment-1");
    expect(reply.humanExternalId).toBe("gh-comment-1");
    expect(reply.humanBody).toBe("Why not use a Map here instead?");
    expect(reply.humanAuthor).toBe("octocat");
    expect(reply.status).toBe("completed");
    expect(reply.category).toBe("clarification");
    expect(reply.errorReason).toBeNull();
    expect(reply.bellaBody).toBe("Because we need insertion order guarantees here.");
    expect(reply.bellaSuggestedCode).toBeNull();
    expect(reply.bellaExternalId).toBe("gh-comment-2");
    expect(reply.inputTokens).toBe(120);
    expect(reply.outputTokens).toBe(45);
    expect(reply.reasoningTokens).toBe(10);
    expect(reply.estimatedCost).toBe(0.0042);
    expect(reply.createdAt).toBe(createdAt);
    expect(reply.completedAt).toBe(completedAt);
  });

  it("round-trips a failed reply with an errorReason and no completedAt", () => {
    const reply = CommentReply.fromPersistence({
      id: "11111111-1111-1111-1111-111111111111",
      commentId: "comment-1",
      humanExternalId: "gh-comment-1",
      humanBody: "Why not use a Map here instead?",
      humanAuthor: "octocat",
      status: "failed",
      category: null,
      errorReason: "LLM provider timed out",
      bellaBody: null,
      bellaSuggestedCode: null,
      bellaExternalId: null,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      estimatedCost: null,
      createdAt: new Date(),
      completedAt: null,
    });

    expect(reply.status).toBe("failed");
    expect(reply.errorReason).toBe("LLM provider timed out");
    expect(reply.completedAt).toBeNull();
  });
});

describe("CommentReply.toJSON", () => {
  it("serializes id as a plain string and omits internal bookkeeping fields", () => {
    const reply = CommentReply.create(baseProps);

    const json = reply.toJSON();

    expect(json.id).toBe(reply.id.value);
    expect(typeof json.id).toBe("string");
    expect(json).not.toHaveProperty("humanExternalId");
    expect(json).not.toHaveProperty("errorReason");
    expect(json).not.toHaveProperty("bellaExternalId");
    expect(json).not.toHaveProperty("inputTokens");
    expect(json).not.toHaveProperty("outputTokens");
    expect(json).not.toHaveProperty("reasoningTokens");
    expect(json).not.toHaveProperty("estimatedCost");
  });

  it("includes the public-facing fields", () => {
    const reply = CommentReply.create(baseProps);

    const json = reply.toJSON();

    expect(json).toMatchObject({
      commentId: "comment-1",
      humanBody: "Why not use a Map here instead?",
      humanAuthor: "octocat",
      status: "queued",
      category: null,
      bellaBody: null,
      bellaSuggestedCode: null,
    });
    expect(json.createdAt).toBe(reply.createdAt);
    expect(json.completedAt).toBe(reply.completedAt);
  });
});
