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
  });
});

describe("Comment.fromPersistence", () => {
  it("wraps the given id and passes stored status/externalId/createdAt through as-is", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const comment = Comment.fromPersistence({
      id: "11111111-1111-1111-1111-111111111111",
      ...baseProps,
      status: "published",
      externalId: "external-123",
      createdAt,
    });

    expect(comment.id.value).toBe("11111111-1111-1111-1111-111111111111");
    expect(comment.status).toBe("published");
    expect(comment.externalId).toBe("external-123");
    expect(comment.createdAt).toBe(createdAt);
  });
});

describe("Comment.toJSON", () => {
  it("serializes id as a plain string and omits reviewTurnId", () => {
    const comment = Comment.create(baseProps);

    const json = comment.toJSON();

    expect(json.id).toBe(comment.id.value);
    expect(typeof json.id).toBe("string");
    expect(json).not.toHaveProperty("reviewTurnId");
  });

  it("includes every other current field", () => {
    const comment = Comment.create(baseProps);

    const json = comment.toJSON();

    expect(json).toMatchObject({
      reviewRunId: "review-run-1",
      file: "src/a.ts",
      line: 10,
      category: "bug",
      severity: "high",
      body: "This looks wrong.",
      status: "generated",
      externalId: null,
    });
    expect(json.createdAt).toBe(comment.createdAt);
  });
});
