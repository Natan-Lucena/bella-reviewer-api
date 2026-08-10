import { describe, expect, it } from "vitest";

import { Comment } from "../entities/comment.entity";
import { isDuplicatePendingSuggestion } from "./is-duplicate-pending-suggestion";

function pendingSuggestion(
  overrides: Partial<{ file: string; line: number; endLine: number; suggestedCode: string }> = {},
): Comment {
  const comment = Comment.create({
    reviewRunId: "run-1",
    reviewTurnId: "turn-1",
    file: overrides.file ?? "src/a.ts",
    line: overrides.line ?? 10,
    endLine: overrides.endLine,
    category: "bug",
    severity: "high",
    body: "Off-by-one.",
    kind: "actionable",
    suggestedCode: overrides.suggestedCode ?? "return items[i - 1];",
  });
  comment.status = "published";
  comment.externalId = "gh-1";
  return comment;
}

describe("isDuplicatePendingSuggestion", () => {
  it("returns true when file/line/endLine/suggestedCode all match an already-pending suggestion", () => {
    const pending = [pendingSuggestion()];

    const isDuplicate = isDuplicatePendingSuggestion(
      {
        file: "src/a.ts",
        line: 10,
        endLine: 10,
        kind: "actionable",
        suggestedCode: "return items[i - 1];",
      },
      pending,
    );

    expect(isDuplicate).toBe(true);
  });

  it("returns true for a matching multi-line range", () => {
    const pending = [
      pendingSuggestion({
        line: 10,
        endLine: 12,
        suggestedCode: "a();\nb();\nc();",
      }),
    ];

    const isDuplicate = isDuplicatePendingSuggestion(
      {
        file: "src/a.ts",
        line: 10,
        endLine: 12,
        kind: "actionable",
        suggestedCode: "a();\nb();\nc();",
      },
      pending,
    );

    expect(isDuplicate).toBe(true);
  });

  it("returns false when the line differs, even for the same file/suggestedCode", () => {
    const pending = [pendingSuggestion({ line: 10 })];

    const isDuplicate = isDuplicatePendingSuggestion(
      {
        file: "src/a.ts",
        line: 11,
        endLine: 11,
        kind: "actionable",
        suggestedCode: "return items[i - 1];",
      },
      pending,
    );

    expect(isDuplicate).toBe(false);
  });

  it("returns false when endLine differs, even for the same file/line/suggestedCode", () => {
    const pending = [pendingSuggestion({ line: 10, endLine: 10 })];

    const isDuplicate = isDuplicatePendingSuggestion(
      {
        file: "src/a.ts",
        line: 10,
        endLine: 12,
        kind: "actionable",
        suggestedCode: "return items[i - 1];",
      },
      pending,
    );

    expect(isDuplicate).toBe(false);
  });

  it("returns false when the file differs", () => {
    const pending = [pendingSuggestion({ file: "src/a.ts" })];

    const isDuplicate = isDuplicatePendingSuggestion(
      {
        file: "src/b.ts",
        line: 10,
        endLine: 10,
        kind: "actionable",
        suggestedCode: "return items[i - 1];",
      },
      pending,
    );

    expect(isDuplicate).toBe(false);
  });

  it("returns false when the suggestedCode differs", () => {
    const pending = [pendingSuggestion({ suggestedCode: "return items[i - 1];" })];

    const isDuplicate = isDuplicatePendingSuggestion(
      {
        file: "src/a.ts",
        line: 10,
        endLine: 10,
        kind: "actionable",
        suggestedCode: "return items[i];",
      },
      pending,
    );

    expect(isDuplicate).toBe(false);
  });

  it("never treats an observation as a duplicate, even if it matches file/line of a pending suggestion", () => {
    const pending = [pendingSuggestion()];

    const isDuplicate = isDuplicatePendingSuggestion(
      { file: "src/a.ts", line: 10, endLine: 10, kind: "observation", suggestedCode: null },
      pending,
    );

    expect(isDuplicate).toBe(false);
  });

  it("returns false when there are no pending suggestions at all", () => {
    expect(
      isDuplicatePendingSuggestion(
        { file: "src/a.ts", line: 10, endLine: 10, kind: "actionable", suggestedCode: "x" },
        [],
      ),
    ).toBe(false);
  });
});
