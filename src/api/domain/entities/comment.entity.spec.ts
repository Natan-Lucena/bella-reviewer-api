import { describe, expect, it } from "vitest";

import { Comment } from "./comment.entity";

const baseProps = {
  reviewRunId: "review-run-1",
  reviewTurnId: "review-turn-1",
  file: "src/a.ts",
  line: 10,
  category: "bug",
  severity: "high" as const,
  body: "This looks wrong.",
  kind: "observation" as const,
  inputTokens: 100,
  outputTokens: 20,
  reasoningTokens: 5,
  estimatedCost: 0.001,
};

const actionableProps = {
  ...baseProps,
  kind: "actionable" as const,
  suggestedCode: "const x = 1;",
};

describe("Comment.create", () => {
  it("generates a random id and defaults status/externalId/createdAt", () => {
    const comment = Comment.create(baseProps);

    expect(comment.id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(comment.status).toBe("generated");
    expect(comment.externalId).toBeNull();
    expect(comment.createdAt).toBeInstanceOf(Date);
  });

  it("passes the given props through unchanged", () => {
    const comment = Comment.create(baseProps);

    expect(comment.reviewRunId).toBe("review-run-1");
    expect(comment.reviewTurnId).toBe("review-turn-1");
    expect(comment.file).toBe("src/a.ts");
    expect(comment.line).toBe(10);
    expect(comment.category).toBe("bug");
    expect(comment.severity).toBe("high");
    expect(comment.body).toBe("This looks wrong.");
    expect(comment.inputTokens).toBe(100);
    expect(comment.outputTokens).toBe(20);
    expect(comment.reasoningTokens).toBe(5);
    expect(comment.estimatedCost).toBe(0.001);
  });

  it("allows a null estimatedCost (model outside the pricing table)", () => {
    const comment = Comment.create({ ...baseProps, estimatedCost: null });

    expect(comment.estimatedCost).toBeNull();
  });

  it("an observation comment always has null suggestedCode/applyStatus, even if suggestedCode was passed", () => {
    const comment = Comment.create({ ...baseProps, suggestedCode: "ignored" });

    expect(comment.kind).toBe("observation");
    expect(comment.suggestedCode).toBeNull();
    expect(comment.applyStatus).toBeNull();
  });

  it("an actionable comment with suggestedCode starts as pending", () => {
    const comment = Comment.create(actionableProps);

    expect(comment.kind).toBe("actionable");
    expect(comment.suggestedCode).toBe("const x = 1;");
    expect(comment.applyStatus).toBe("pending");
    expect(comment.appliedAt).toBeNull();
    expect(comment.appliedAtCommit).toBeNull();
    expect(comment.detectionMethod).toBeNull();
  });

  it("throws when kind is actionable but suggestedCode is missing or blank", () => {
    expect(() => Comment.create({ ...baseProps, kind: "actionable" })).toThrow(/suggestedCode/);
    expect(() => Comment.create({ ...baseProps, kind: "actionable", suggestedCode: "" })).toThrow(
      /suggestedCode/,
    );
  });

  it("defaults endLine to line when not given", () => {
    const comment = Comment.create(baseProps);

    expect(comment.line).toBe(10);
    expect(comment.endLine).toBe(10);
  });

  it("keeps an explicit endLine distinct from line", () => {
    const comment = Comment.create({ ...actionableProps, endLine: 12 });

    expect(comment.line).toBe(10);
    expect(comment.endLine).toBe(12);
  });
});

describe("Comment.markApplyStatus", () => {
  it("returns a new instance — the original is untouched", () => {
    const comment = Comment.create(actionableProps);

    const updated = comment.markApplyStatus("applied_manual", {
      commitSha: "abc123",
      detectionMethod: "content_match",
    });

    expect(updated).not.toBe(comment);
    expect(comment.applyStatus).toBe("pending");
    expect(updated.applyStatus).toBe("applied_manual");
  });

  it("sets appliedAt when transitioning to an applied status", () => {
    const comment = Comment.create(actionableProps);

    const updated = comment.markApplyStatus("applied_button", {
      commitSha: "abc123",
      detectionMethod: "commit_message_match",
    });

    expect(updated.appliedAt).toBeInstanceOf(Date);
    expect(updated.appliedAtCommit).toBe("abc123");
    expect(updated.detectionMethod).toBe("commit_message_match");
  });

  it("does not set appliedAt for a non-applied transition", () => {
    const comment = Comment.create(actionableProps);

    const updated = comment.markApplyStatus("not_applied", {
      commitSha: null,
      detectionMethod: "pr_closed",
    });

    expect(updated.applyStatus).toBe("not_applied");
    expect(updated.appliedAt).toBeNull();
  });

  it("preserves every other field of the original comment", () => {
    const comment = Comment.create(actionableProps);

    const updated = comment.markApplyStatus("dismissed", {
      commitSha: null,
      detectionMethod: "thread_resolved_without_match",
    });

    expect(updated.id).toBe(comment.id);
    expect(updated.file).toBe(comment.file);
    expect(updated.suggestedCode).toBe(comment.suggestedCode);
    expect(updated.status).toBe(comment.status);
    expect(updated.createdAt).toBe(comment.createdAt);
  });

  it("preserves endLine across the transition", () => {
    const comment = Comment.create({ ...actionableProps, endLine: 12 });

    const updated = comment.markApplyStatus("applied_manual", {
      commitSha: "abc123",
      detectionMethod: "content_match",
    });

    expect(updated.line).toBe(10);
    expect(updated.endLine).toBe(12);
  });
});

describe("Comment.fromPersistence", () => {
  it("wraps the given id and passes every stored field through as-is", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const appliedAt = new Date("2026-01-02T00:00:00.000Z");
    const comment = Comment.fromPersistence({
      id: "11111111-1111-1111-1111-111111111111",
      ...actionableProps,
      status: "published",
      externalId: "external-123",
      applyStatus: "applied_manual",
      appliedAt,
      appliedAtCommit: "def456",
      detectionMethod: "content_match",
      createdAt,
    });

    expect(comment.id.value).toBe("11111111-1111-1111-1111-111111111111");
    expect(comment.status).toBe("published");
    expect(comment.externalId).toBe("external-123");
    expect(comment.kind).toBe("actionable");
    expect(comment.suggestedCode).toBe("const x = 1;");
    expect(comment.applyStatus).toBe("applied_manual");
    expect(comment.appliedAt).toBe(appliedAt);
    expect(comment.appliedAtCommit).toBe("def456");
    expect(comment.detectionMethod).toBe("content_match");
    expect(comment.inputTokens).toBe(100);
    expect(comment.outputTokens).toBe(20);
    expect(comment.reasoningTokens).toBe(5);
    expect(comment.estimatedCost).toBe(0.001);
    expect(comment.createdAt).toBe(createdAt);
  });

  it("resolves a null endLine (row predates this column) to line", () => {
    const comment = Comment.fromPersistence({
      id: "11111111-1111-1111-1111-111111111111",
      ...actionableProps,
      endLine: null,
      contextBefore: null,
      contextAfter: null,
      status: "published",
      externalId: "external-123",
      applyStatus: "applied_manual",
      appliedAt: null,
      appliedAtCommit: null,
      detectionMethod: null,
      createdAt: new Date(),
    });

    expect(comment.line).toBe(10);
    expect(comment.endLine).toBe(10);
  });

  it("keeps an explicit stored endLine distinct from line", () => {
    const comment = Comment.fromPersistence({
      id: "11111111-1111-1111-1111-111111111111",
      ...actionableProps,
      endLine: 15,
      contextBefore: null,
      contextAfter: null,
      status: "published",
      externalId: "external-123",
      applyStatus: "applied_manual",
      appliedAt: null,
      appliedAtCommit: null,
      detectionMethod: null,
      createdAt: new Date(),
    });

    expect(comment.line).toBe(10);
    expect(comment.endLine).toBe(15);
  });
});

describe("Comment.toJSON", () => {
  it("serializes id as a plain string and omits reviewTurnId/detectionMethod", () => {
    const comment = Comment.create(baseProps);

    const json = comment.toJSON();

    expect(json.id).toBe(comment.id.value);
    expect(typeof json.id).toBe("string");
    expect(json).not.toHaveProperty("reviewTurnId");
    expect(json).not.toHaveProperty("detectionMethod");
  });

  it("includes every other current field, including the new ones", () => {
    const comment = Comment.create(actionableProps);

    const json = comment.toJSON();

    expect(json).toMatchObject({
      reviewRunId: "review-run-1",
      file: "src/a.ts",
      line: 10,
      endLine: 10,
      category: "bug",
      severity: "high",
      body: "This looks wrong.",
      status: "generated",
      externalId: null,
      kind: "actionable",
      suggestedCode: "const x = 1;",
      applyStatus: "pending",
      appliedAt: null,
      appliedAtCommit: null,
      inputTokens: 100,
      outputTokens: 20,
      reasoningTokens: 5,
      estimatedCost: 0.001,
    });
    expect(json.createdAt).toBe(comment.createdAt);
  });
});
