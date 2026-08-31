import { describe, expect, it } from "vitest";

import { ReviewRun } from "./review-run.entity";

const baseProps = {
  repoId: "repo-1",
  prNumber: 42,
  commitSha: "a".repeat(40),
  trigger: "webhook" as const,
};

describe("ReviewRun.create", () => {
  it("generates a random id and createdAt", () => {
    const run = ReviewRun.create(baseProps);

    expect(run.id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(run.createdAt).toBeInstanceOf(Date);
  });

  it("passes the given props through unchanged", () => {
    const run = ReviewRun.create(baseProps);

    expect(run.repoId).toBe("repo-1");
    expect(run.prNumber).toBe(42);
    expect(run.commitSha).toBe("a".repeat(40));
    expect(run.trigger).toBe("webhook");
  });

  it("defaults status to queued and every LLM-derived field to its not-yet-computed value", () => {
    const run = ReviewRun.create(baseProps);

    expect(run.status).toBe("queued");
    expect(run.errorReason).toBeNull();
    expect(run.totalInputTokens).toBe(0);
    expect(run.totalOutputTokens).toBe(0);
    expect(run.totalReasoningTokens).toBe(0);
    expect(run.llmProvider).toBeNull();
    expect(run.model).toBeNull();
    expect(run.estimatedCost).toBeNull();
    expect(run.startedAt).toBeNull();
    expect(run.completedAt).toBeNull();
  });
});

describe("ReviewRun.fromPersistence", () => {
  it("wraps the given id and passes every stored field through as-is", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const startedAt = new Date("2026-01-01T00:01:00.000Z");
    const completedAt = new Date("2026-01-01T00:05:00.000Z");

    const run = ReviewRun.fromPersistence({
      id: "11111111-1111-1111-1111-111111111111",
      repoId: "repo-1",
      prNumber: 42,
      commitSha: "a".repeat(40),
      trigger: "webhook",
      status: "completed",
      errorReason: null,
      totalInputTokens: 1200,
      totalOutputTokens: 450,
      totalReasoningTokens: 100,
      llmProvider: "gemini",
      model: "gemini-2.5-flash",
      estimatedCost: 0.042,
      startedAt,
      completedAt,
      createdAt,
    });

    expect(run.id.value).toBe("11111111-1111-1111-1111-111111111111");
    expect(run.repoId).toBe("repo-1");
    expect(run.prNumber).toBe(42);
    expect(run.commitSha).toBe("a".repeat(40));
    expect(run.trigger).toBe("webhook");
    expect(run.status).toBe("completed");
    expect(run.errorReason).toBeNull();
    expect(run.totalInputTokens).toBe(1200);
    expect(run.totalOutputTokens).toBe(450);
    expect(run.totalReasoningTokens).toBe(100);
    expect(run.llmProvider).toBe("gemini");
    expect(run.model).toBe("gemini-2.5-flash");
    expect(run.estimatedCost).toBe(0.042);
    expect(run.startedAt).toBe(startedAt);
    expect(run.completedAt).toBe(completedAt);
    expect(run.createdAt).toBe(createdAt);
  });

  it("round-trips a row created before llmProvider/model existed as null for both", () => {
    const run = ReviewRun.fromPersistence({
      id: "11111111-1111-1111-1111-111111111111",
      repoId: "repo-1",
      prNumber: 42,
      commitSha: "a".repeat(40),
      trigger: "action",
      status: "failed",
      errorReason: "LLM provider timed out",
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalReasoningTokens: 0,
      llmProvider: null,
      model: null,
      estimatedCost: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
    });

    expect(run.status).toBe("failed");
    expect(run.errorReason).toBe("LLM provider timed out");
    expect(run.llmProvider).toBeNull();
    expect(run.model).toBeNull();
  });
});

describe("ReviewRun.toJSON", () => {
  it("serializes id as a plain string", () => {
    const run = ReviewRun.create(baseProps);

    const json = run.toJSON();

    expect(json.id).toBe(run.id.value);
    expect(typeof json.id).toBe("string");
  });

  it("includes the public-facing fields, including the llmProvider/model snapshot", () => {
    const run = ReviewRun.create(baseProps);
    run.llmProvider = "claude";
    run.model = "claude-sonnet-5";

    const json = run.toJSON();

    expect(json).toMatchObject({
      prNumber: 42,
      commitSha: "a".repeat(40),
      trigger: "webhook",
      status: "queued",
      errorReason: null,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalReasoningTokens: 0,
      llmProvider: "claude",
      model: "claude-sonnet-5",
      estimatedCost: null,
      startedAt: null,
      completedAt: null,
    });
    expect(json.createdAt).toBe(run.createdAt);
  });

  it("defaults llmProvider and model to null when not yet resolved", () => {
    const run = ReviewRun.create(baseProps);

    const json = run.toJSON();

    expect(json.llmProvider).toBeNull();
    expect(json.model).toBeNull();
  });
});
