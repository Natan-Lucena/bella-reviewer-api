import { beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

const generateMock = vi.fn();
const publishCommentMock = vi.fn();
const publishGeneralCommentMock = vi.fn();

// review() and publishComments() are real (pure) functions — only the
// concrete adapters they're handed need mocking, since this use case builds
// them itself from decrypted credentials rather than receiving them via DI.
vi.mock("../../../integration/gemini/gemini-llm-provider", () => ({
  GeminiLlmProvider: vi.fn().mockImplementation(() => ({ generate: generateMock })),
}));

vi.mock("../../../integration/claude/claude-llm-provider", () => ({
  ClaudeLlmProvider: vi.fn().mockImplementation(() => ({ generate: generateMock })),
}));

vi.mock("../../../integration/openai/openai-llm-provider", () => ({
  OpenAiLlmProvider: vi.fn().mockImplementation(() => ({ generate: generateMock })),
}));

vi.mock("../../../integration/github/github-scm-adapter", () => ({
  GithubScmAdapter: vi.fn().mockImplementation(() => ({
    publishComment: publishCommentMock,
    publishGeneralComment: publishGeneralCommentMock,
    getDiff: vi.fn(),
  })),
}));

import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { Comment } from "../../../domain/entities/comment.entity";
import { Credential } from "../../../domain/entities/credential.entity";
import { Prompt } from "../../../domain/entities/prompt.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { Diff } from "../../../domain/ports/scm-adapter.port";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReviewTurnRepository } from "../../../domain/repository/review-turn.repository";
import { ClaudeLlmProvider } from "../../../integration/claude/claude-llm-provider";
import { GeminiLlmProvider } from "../../../integration/gemini/gemini-llm-provider";
import { OpenAiLlmProvider } from "../../../integration/openai/openai-llm-provider";
import { ProcessReviewRunUseCase } from "./process-review-run-use-case";

const emptyDiff: Diff = { files: [] };

const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
const repoConfig = RepoConfig.create({
  repoId: repo.id.value,
  llmProvider: "gemini",
  model: "gemini-2.5-flash",
  tokenLimit: 100000,
});
const llmCredential = Credential.createLlm({
  repoId: repo.id.value,
  provider: "gemini",
  encryptedSecret: encrypt("gemini-key"),
});
const scmCredential = Credential.createScm({
  repoId: repo.id.value,
  encryptedSecret: encrypt("github-pat"),
});

function makeReviewRun(): ReviewRun {
  return ReviewRun.create({
    repoId: repo.id.value,
    prNumber: 42,
    commitSha: "abc123",
    trigger: "action",
  });
}

function makeDeps(overrides: { withCredentials?: boolean } = { withCredentials: true }) {
  const reviewRunRepository = mock<ReviewRunRepository>();
  const repoRepository = mock<RepoRepository>();
  const repoConfigRepository = mock<RepoConfigRepository>();
  const credentialRepository = mock<CredentialRepository>();
  const reviewTurnRepository = mock<ReviewTurnRepository>();
  const commentRepository = mock<CommentRepository>();
  const promptRepository = mock<PromptRepository>();

  repoRepository.findById.mockResolvedValue(repo);
  repoConfigRepository.findByRepoId.mockResolvedValue(repoConfig);
  // Default: this repo already has a prior completed run, so the welcome
  // message is skipped unless a test explicitly overrides this to simulate
  // a brand-new repo. Keeps every test not about the welcome message itself
  // from having to think about it.
  reviewRunRepository.findByRepoId.mockResolvedValue({ reviewRuns: [], total: 1 });
  commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([]);
  if (overrides.withCredentials !== false) {
    credentialRepository.findByRepoIdAndType.mockImplementation(async (_repoId, type) =>
      type === "llm" ? llmCredential : type === "scm" ? scmCredential : null,
    );
  } else {
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
  }

  const useCase = new ProcessReviewRunUseCase(
    reviewRunRepository,
    repoRepository,
    repoConfigRepository,
    credentialRepository,
    reviewTurnRepository,
    commentRepository,
    promptRepository,
  );

  return {
    useCase,
    reviewRunRepository,
    repoRepository,
    repoConfigRepository,
    credentialRepository,
    reviewTurnRepository,
    commentRepository,
    promptRepository,
  };
}

function validLlmResponse(comments: unknown[] = [], overview?: string | null) {
  return {
    content: JSON.stringify({ comments, overview }),
    tokensInput: 100,
    tokensOutput: 20,
    tokensReasoning: 0,
  };
}

describe("ProcessReviewRunUseCase", () => {
  beforeEach(() => {
    generateMock.mockReset();
    publishCommentMock.mockReset();
    publishGeneralCommentMock.mockReset();
    publishGeneralCommentMock.mockResolvedValue(undefined);
    vi.mocked(GeminiLlmProvider).mockClear();
    vi.mocked(ClaudeLlmProvider).mockClear();
    vi.mocked(OpenAiLlmProvider).mockClear();
  });

  it("returns review_run_not_found without touching anything else", async () => {
    const { useCase, reviewRunRepository, repoRepository } = makeDeps();
    reviewRunRepository.findById.mockResolvedValue(null);

    const result = await useCase.execute({ reviewRunId: "missing", diff: emptyDiff });

    expect(result).toEqual({ ok: false, error: "review_run_not_found" });
    expect(reviewRunRepository.save).not.toHaveBeenCalled();
    expect(repoRepository.findById).not.toHaveBeenCalled();
  });

  it("marks the run processing before doing anything else", async () => {
    const { useCase, reviewRunRepository } = makeDeps();
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    generateMock.mockResolvedValue(validLlmResponse());
    // The entity is mutated in place across the whole flow, so a snapshot is
    // needed at call time — inspecting mock.calls afterwards would only ever
    // show the final, fully-mutated object.
    const statusesAtSaveTime: string[] = [];
    reviewRunRepository.save.mockImplementation(async (rr) => {
      statusesAtSaveTime.push(rr.status);
    });

    await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

    expect(statusesAtSaveTime[0]).toBe("processing");
    expect(reviewRun.startedAt).toBeInstanceOf(Date);
  });

  describe("LLM provider selection", () => {
    it.each([
      { provider: "gemini" as const, expectedClass: GeminiLlmProvider },
      { provider: "claude" as const, expectedClass: ClaudeLlmProvider },
      { provider: "openai" as const, expectedClass: OpenAiLlmProvider },
    ])(
      "instantiates the $provider provider for repoConfig.llmProvider = $provider",
      async ({ provider, expectedClass }) => {
        const { useCase, reviewRunRepository, repoConfigRepository } = makeDeps();
        repoConfigRepository.findByRepoId.mockResolvedValue(
          repoConfig.update({ llmProvider: provider }),
        );
        const reviewRun = makeReviewRun();
        reviewRunRepository.findById.mockResolvedValue(reviewRun);
        generateMock.mockResolvedValue(validLlmResponse());

        await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

        const allClasses = [GeminiLlmProvider, ClaudeLlmProvider, OpenAiLlmProvider];
        for (const klass of allClasses) {
          if (klass === expectedClass) {
            expect(klass).toHaveBeenCalledTimes(1);
          } else {
            expect(klass).not.toHaveBeenCalled();
          }
        }
      },
    );
  });

  it("fails with a specific reason when the LLM credential is missing", async () => {
    const { useCase, reviewRunRepository, credentialRepository } = makeDeps({
      withCredentials: false,
    });
    credentialRepository.findByRepoIdAndType.mockImplementation(async (_repoId, type) =>
      type === "scm" ? scmCredential : null,
    );
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);

    const result = await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

    expect(result).toEqual({
      ok: true,
      value: { reviewRunId: reviewRun.id.value, status: "failed" },
    });
    const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.status).toBe("failed");
    expect(finalSave.errorReason).toBe("LLM credential not configured");
    expect(finalSave.completedAt).toBeInstanceOf(Date);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("fails with a specific reason when the SCM credential is missing", async () => {
    const { useCase, reviewRunRepository, credentialRepository } = makeDeps({
      withCredentials: false,
    });
    credentialRepository.findByRepoIdAndType.mockImplementation(async (_repoId, type) =>
      type === "llm" ? llmCredential : null,
    );
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);

    const result = await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

    expect(result).toEqual({
      ok: true,
      value: { reviewRunId: reviewRun.id.value, status: "failed" },
    });
    const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.errorReason).toBe("SCM credential not configured");
  });

  it("fails without calling the LLM when the diff exceeds the configured token limit", async () => {
    const smallLimitConfig = RepoConfig.create({
      repoId: repo.id.value,
      llmProvider: "gemini",
      model: "gemini-2.5-flash",
      tokenLimit: 1,
    });
    const { useCase, reviewRunRepository, repoConfigRepository } = makeDeps();
    repoConfigRepository.findByRepoId.mockResolvedValue(smallLimitConfig);
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    const hugeDiff: Diff = {
      files: [
        {
          path: "big.ts",
          hunks: [
            {
              oldStartLine: 1,
              newStartLine: 1,
              lines: [{ content: "x".repeat(1000), status: "added", lineNumber: 1 }],
            },
          ],
        },
      ],
    };

    const result = await useCase.execute({ reviewRunId: reviewRun.id.value, diff: hugeDiff });

    expect(result).toEqual({
      ok: true,
      value: { reviewRunId: reviewRun.id.value, status: "failed" },
    });
    const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.errorReason).toContain("exceeds the configured token limit");
    expect(generateMock).not.toHaveBeenCalled();
    expect(publishCommentMock).not.toHaveBeenCalled();
  });

  it("persists a null estimatedCost (never 0) when repoConfig.model isn't in the pricing table", async () => {
    const { useCase, reviewRunRepository, repoConfigRepository } = makeDeps();
    repoConfigRepository.findByRepoId.mockResolvedValue(
      RepoConfig.create({
        repoId: repo.id.value,
        llmProvider: "gemini",
        model: "some-future-model",
        tokenLimit: 100000,
      }),
    );
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    generateMock.mockResolvedValue(validLlmResponse());

    await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

    const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.estimatedCost).toBeNull();
  });

  describe("llmProvider/model snapshot", () => {
    it("captures repoConfig.llmProvider/model at the moment cost is computed, on a successful run", async () => {
      const { useCase, reviewRunRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse());

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
      expect(finalSave.llmProvider).toBe(repoConfig.llmProvider);
      expect(finalSave.model).toBe(repoConfig.model);
    });

    it("leaves llmProvider/model null when the run fails before generation (missing LLM credential)", async () => {
      const { useCase, reviewRunRepository, credentialRepository } = makeDeps({
        withCredentials: false,
      });
      credentialRepository.findByRepoIdAndType.mockImplementation(async (_repoId, type) =>
        type === "scm" ? scmCredential : null,
      );
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
      expect(finalSave.status).toBe("failed");
      expect(finalSave.llmProvider).toBeNull();
      expect(finalSave.model).toBeNull();
      expect(generateMock).not.toHaveBeenCalled();
    });

    it("does not retroactively rewrite an already-completed run's snapshot when repoConfig changes afterward", async () => {
      const { useCase, reviewRunRepository, repoConfigRepository } = makeDeps();
      const firstRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValueOnce(firstRun);
      generateMock.mockResolvedValue(validLlmResponse());

      await useCase.execute({ reviewRunId: firstRun.id.value, diff: emptyDiff });

      expect(firstRun.llmProvider).toBe("gemini");
      expect(firstRun.model).toBe("gemini-2.5-flash");

      // repoConfig mutates AFTER the first run already completed and saved
      // its snapshot — this is the entire point of the feature: a mutable
      // config must never retroactively rewrite a historical snapshot.
      repoConfigRepository.findByRepoId.mockResolvedValue(
        repoConfig.update({ llmProvider: "claude", model: "claude-sonnet-4-5" }),
      );
      const secondRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValueOnce(secondRun);

      await useCase.execute({ reviewRunId: secondRun.id.value, diff: emptyDiff });

      // The second run picks up the new config...
      expect(secondRun.llmProvider).toBe("claude");
      expect(secondRun.model).toBe("claude-sonnet-4-5");
      // ...but the first run's already-persisted snapshot is untouched.
      expect(firstRun.llmProvider).toBe("gemini");
      expect(firstRun.model).toBe("gemini-2.5-flash");
    });
  });

  it("completes successfully, persisting turns/comments and publishing them", async () => {
    const { useCase, reviewRunRepository, reviewTurnRepository, commentRepository } = makeDeps();
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    generateMock.mockResolvedValue(
      validLlmResponse([
        {
          file: "a.ts",
          line: 1,
          category: "bug",
          severity: "high",
          body: "Looks wrong.",
          kind: "actionable",
          suggestedCode: "return items[i - 1];",
        },
      ]),
    );
    publishCommentMock.mockResolvedValue({ externalId: "gh-1" });

    const result = await useCase.execute({
      reviewRunId: reviewRun.id.value,
      diff: emptyDiff,
      prTitle: "Fix bug",
      prDescription: "Details.",
    });

    expect(result).toEqual({
      ok: true,
      value: { reviewRunId: reviewRun.id.value, status: "completed" },
    });

    expect(reviewTurnRepository.save).toHaveBeenCalledTimes(1);
    const savedTurn = reviewTurnRepository.save.mock.calls[0][0];
    expect(savedTurn.inputTokens).toBe(100);
    expect(savedTurn.outputTokens).toBe(20);

    // Once when this use case persists the freshly generated comment
    // (status "generated"), once more when publishComments persists the
    // outcome of the publish attempt (status "published").
    expect(commentRepository.save).toHaveBeenCalledTimes(2);
    const savedComment = commentRepository.save.mock.calls[0][0];
    expect(savedComment.reviewTurnId).toBe(savedTurn.id.value);
    // Locks the current 1:1 field mapping from the LLM's ReviewComment into
    // Comment.create, including kind/suggestedCode arriving intact.
    expect(savedComment.file).toBe("a.ts");
    expect(savedComment.line).toBe(1);
    expect(savedComment.category).toBe("bug");
    expect(savedComment.severity).toBe("high");
    expect(savedComment.body).toBe("Looks wrong.");
    expect(savedComment.kind).toBe("actionable");
    expect(savedComment.suggestedCode).toBe("return items[i - 1];");
    const finalCommentSave = commentRepository.save.mock.calls.at(-1)?.[0];
    expect(finalCommentSave.status).toBe("published");
    expect(finalCommentSave.externalId).toBe("gh-1");

    expect(publishCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ repoFullName: "org/repo", prNumber: 42, commitSha: "abc123" }),
    );

    const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.status).toBe("completed");
    expect(finalSave.totalInputTokens).toBe(100);
    expect(finalSave.totalOutputTokens).toBe(20);
    // gemini-2.5-flash: 100 input tokens * $0.30/1M + 20 output tokens (0
    // reasoning) * $2.50/1M.
    expect(finalSave.estimatedCost).toBeCloseTo(0.00008, 10);
  });

  it("computes estimatedCost from repoConfig.llmProvider together with repoConfig.model, not model alone", async () => {
    const { useCase, reviewRunRepository, repoConfigRepository } = makeDeps();
    // Same shape of usage as the Gemini case above, but a different provider
    // — proves the pricing lookup is keyed by (provider, model) together.
    // A regression that dropped `provider` and looked the model up against
    // the wrong (or a fixed) provider's table would silently compute the
    // Gemini price here instead.
    repoConfigRepository.findByRepoId.mockResolvedValue(
      repoConfig.update({ llmProvider: "claude", model: "claude-sonnet-4-5" }),
    );
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    generateMock.mockResolvedValue(validLlmResponse());

    await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

    const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
    // claude-sonnet-4-5: 100 input tokens * $3.00/1M + 20 output tokens (0
    // reasoning) * $15.00/1M — different from the $0.00008 the Gemini test
    // above gets for the identical token counts.
    expect(finalSave.estimatedCost).toBeCloseTo(0.0006, 10);
  });

  it("captures contextBefore/contextAfter from the diff around the flagged line (DT-01)", async () => {
    const { useCase, reviewRunRepository, commentRepository } = makeDeps();
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    generateMock.mockResolvedValue(
      validLlmResponse([
        {
          file: "a.ts",
          line: 40,
          category: "bug",
          severity: "high",
          body: "Off-by-one.",
          kind: "actionable",
          suggestedCode: "return items.reduce((sum, i) => sum + i.price, 0);",
        },
      ]),
    );
    publishCommentMock.mockResolvedValue({ externalId: "gh-1" });
    const diffWithContext: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [
            {
              oldStartLine: 39,
              newStartLine: 39,
              lines: [
                {
                  content: "function calculateTotal(items) {",
                  status: "unchanged",
                  lineNumber: 39,
                },
                {
                  content: "  return items.reduce((sum, i) => sum + i.price);",
                  status: "added",
                  lineNumber: 40,
                },
                { content: "}", status: "unchanged", lineNumber: 41 },
              ],
            },
          ],
        },
      ],
    };

    await useCase.execute({ reviewRunId: reviewRun.id.value, diff: diffWithContext });

    const savedComment = commentRepository.save.mock.calls[0][0];
    expect(savedComment.contextBefore).toBe("function calculateTotal(items) {");
    expect(savedComment.contextAfter).toBe("}");
  });

  describe("multi-line suggestions that overlap their own declared boundary (DT-02)", () => {
    // Reproduces a real case seen from Gemini: the model declared line/endLine
    // covering only the function BODY, but suggestedCode included the
    // function's signature too (outside the declared range) — applying it
    // literally (GitHub replaces only the declared range) would leave the
    // original signature untouched and paste a second one right after it.
    const diffWithFunction: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [
            {
              oldStartLine: 1,
              newStartLine: 1,
              lines: [
                {
                  content: "export function findMax(items) {",
                  status: "added",
                  lineNumber: 1,
                },
                { content: "  let max = items[0];", status: "added", lineNumber: 2 },
                { content: "  return max;", status: "added", lineNumber: 3 },
                { content: "}", status: "added", lineNumber: 4 },
              ],
            },
          ],
        },
      ],
    };

    it("degrades to observation when suggestedCode re-includes the line right before the declared range", async () => {
      const { useCase, reviewRunRepository, commentRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(
        validLlmResponse([
          {
            file: "a.ts",
            line: 2, // declared range: body only (line 2-3)
            endLine: 3,
            category: "bug",
            severity: "high",
            body: "Missing empty-array guard.",
            kind: "actionable",
            // Re-includes line 1 (the signature, outside 2-3) and line 4
            // (the closing brace, also outside 2-3) — exactly the shape
            // that corrupted a real file.
            suggestedCode:
              "export function findMax(items) {\n  if (items.length === 0) throw new Error();\n  let max = items[0];\n  return max;\n}",
          },
        ]),
      );
      publishCommentMock.mockResolvedValue({ externalId: "gh-1" });

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: diffWithFunction });

      const savedComment = commentRepository.save.mock.calls[0][0];
      expect(savedComment.kind).toBe("observation");
      expect(savedComment.suggestedCode).toBeNull();
    });

    it("keeps a multi-line suggestion actionable when it stays within its declared range, not touching the neighbors", async () => {
      const { useCase, reviewRunRepository, commentRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(
        validLlmResponse([
          {
            file: "a.ts",
            line: 2,
            endLine: 3,
            category: "bug",
            severity: "high",
            body: "Missing empty-array guard.",
            kind: "actionable",
            // Stays within lines 2-3 only — never echoes line 1 or line 4.
            suggestedCode: "  if (items.length === 0) throw new Error();\n  return items[0];",
          },
        ]),
      );
      publishCommentMock.mockResolvedValue({ externalId: "gh-1" });

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: diffWithFunction });

      const savedComment = commentRepository.save.mock.calls[0][0];
      expect(savedComment.kind).toBe("actionable");
      expect(savedComment.suggestedCode).toBe(
        "  if (items.length === 0) throw new Error();\n  return items[0];",
      );
    });
  });

  describe("multi-line suggestions whose range points at the wrong block entirely (DT-02)", () => {
    // Reproduces a real case seen from Gemini: in a diff with two small,
    // similarly-shaped functions, the model declared a range that's
    // actually part of clampToRange's body, but wrote a suggestion for a
    // completely different function (binarySearch). Applying it literally
    // would overwrite clampToRange with a duplicate/mismatched block.
    const diffWithTwoFunctions: Diff = {
      files: [
        {
          path: "a.ts",
          hunks: [
            {
              oldStartLine: 1,
              newStartLine: 1,
              lines: [
                {
                  content: "export function clampToRange(value, min, max) {",
                  status: "added",
                  lineNumber: 1,
                },
                { content: "  if (value > max) return min;", status: "added", lineNumber: 2 },
                { content: "  if (value < min) return max;", status: "added", lineNumber: 3 },
                { content: "  return value;", status: "added", lineNumber: 4 },
                { content: "}", status: "added", lineNumber: 5 },
                { content: "", status: "added", lineNumber: 6 },
                {
                  content: "export function binarySearch(sorted, target) {",
                  status: "added",
                  lineNumber: 7,
                },
                { content: "  return -1;", status: "added", lineNumber: 8 },
                { content: "}", status: "added", lineNumber: 9 },
              ],
            },
          ],
        },
      ],
    };

    it("degrades to observation when suggestedCode shares zero meaningful content with what's actually at the declared range", async () => {
      const { useCase, reviewRunRepository, commentRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(
        validLlmResponse([
          {
            file: "a.ts",
            line: 2, // actually clampToRange's body — mismatched with the suggestion below
            endLine: 4,
            category: "bug",
            severity: "high",
            body: "Off by one in binarySearch.",
            kind: "actionable",
            suggestedCode:
              "export function binarySearch(sorted, target) {\n  return sorted.indexOf(target);\n}",
          },
        ]),
      );
      publishCommentMock.mockResolvedValue({ externalId: "gh-1" });

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: diffWithTwoFunctions });

      const savedComment = commentRepository.save.mock.calls[0][0];
      expect(savedComment.kind).toBe("observation");
      expect(savedComment.suggestedCode).toBeNull();
    });

    it("keeps a multi-line suggestion actionable when it genuinely targets the declared range", async () => {
      const { useCase, reviewRunRepository, commentRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(
        validLlmResponse([
          {
            file: "a.ts",
            line: 1,
            endLine: 5,
            category: "bug",
            severity: "high",
            body: "Simplify with Math.min/Math.max.",
            kind: "actionable",
            suggestedCode:
              "export function clampToRange(value, min, max) {\n  return Math.max(min, Math.min(value, max));\n}",
          },
        ]),
      );
      publishCommentMock.mockResolvedValue({ externalId: "gh-1" });

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: diffWithTwoFunctions });

      const savedComment = commentRepository.save.mock.calls[0][0];
      expect(savedComment.kind).toBe("actionable");
      expect(savedComment.suggestedCode).toBe(
        "export function clampToRange(value, min, max) {\n  return Math.max(min, Math.min(value, max));\n}",
      );
    });
  });

  describe("duplicate suggestions from a still-pending earlier run", () => {
    function actionableRawComment(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        file: "a.ts",
        line: 1,
        category: "bug",
        severity: "high",
        body: "Off-by-one.",
        kind: "actionable",
        suggestedCode: "return items[i - 1];",
        ...overrides,
      };
    }

    it("skips creating/publishing a suggestion that exactly matches an already-pending one for this PR", async () => {
      const { useCase, reviewRunRepository, commentRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      const alreadyPending = Comment.create({
        reviewRunId: "earlier-run",
        reviewTurnId: "earlier-turn",
        file: "a.ts",
        line: 1,
        category: "bug",
        severity: "high",
        body: "Off-by-one.",
        kind: "actionable",
        suggestedCode: "return items[i - 1];",
      });
      commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([
        alreadyPending,
      ]);
      generateMock.mockResolvedValue(validLlmResponse([actionableRawComment()]));

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(commentRepository.save).not.toHaveBeenCalled();
      expect(publishCommentMock).not.toHaveBeenCalled();
    });

    it("still persists/publishes a suggestion for the same file/line if the suggestedCode differs", async () => {
      const { useCase, reviewRunRepository, commentRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      const alreadyPending = Comment.create({
        reviewRunId: "earlier-run",
        reviewTurnId: "earlier-turn",
        file: "a.ts",
        line: 1,
        category: "bug",
        severity: "high",
        body: "Off-by-one.",
        kind: "actionable",
        suggestedCode: "return items[i - 1];",
      });
      commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([
        alreadyPending,
      ]);
      generateMock.mockResolvedValue(
        validLlmResponse([actionableRawComment({ suggestedCode: "return items.at(-1);" })]),
      );
      publishCommentMock.mockResolvedValue({ externalId: "gh-2" });

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(commentRepository.save).toHaveBeenCalled();
      expect(publishCommentMock).toHaveBeenCalled();
    });

    it("never dedupes an observation, even if it matches file/line of a pending suggestion", async () => {
      const { useCase, reviewRunRepository, commentRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      const alreadyPending = Comment.create({
        reviewRunId: "earlier-run",
        reviewTurnId: "earlier-turn",
        file: "a.ts",
        line: 1,
        category: "bug",
        severity: "high",
        body: "Off-by-one.",
        kind: "actionable",
        suggestedCode: "return items[i - 1];",
      });
      commentRepository.findPendingSuggestionsByRepoIdAndPrNumber.mockResolvedValue([
        alreadyPending,
      ]);
      generateMock.mockResolvedValue(
        validLlmResponse([actionableRawComment({ kind: "observation", suggestedCode: null })]),
      );
      publishCommentMock.mockResolvedValue({ externalId: "gh-2" });

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(commentRepository.save).toHaveBeenCalled();
      expect(publishCommentMock).toHaveBeenCalled();
    });

    it("queries pending suggestions scoped by this PR's repoId/prNumber", async () => {
      const { useCase, reviewRunRepository, commentRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse());

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(commentRepository.findPendingSuggestionsByRepoIdAndPrNumber).toHaveBeenCalledWith(
        repo.id.value,
        42,
      );
    });
  });

  it("completes (not failed) when the single turn's LLM call fails, but surfaces the reason on the run itself — not silently indistinguishable from a clean PR", async () => {
    const { useCase, reviewRunRepository, reviewTurnRepository, commentRepository } = makeDeps();
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    generateMock.mockRejectedValue(new Error("provider error"));

    const result = await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

    expect(result).toEqual({
      ok: true,
      value: { reviewRunId: reviewRun.id.value, status: "completed" },
    });
    const savedTurn = reviewTurnRepository.save.mock.calls[0][0];
    expect(savedTurn.errorReason).toBe("provider error");
    const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.status).toBe("completed");
    expect(finalSave.errorReason).toBe("provider error");
    expect(commentRepository.save).not.toHaveBeenCalled();
    expect(publishCommentMock).not.toHaveBeenCalled();
  });

  it("stays completed but records the errorReason when publishing a comment fails", async () => {
    const { useCase, reviewRunRepository } = makeDeps();
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    generateMock.mockResolvedValue(
      validLlmResponse([
        {
          file: "a.ts",
          line: 1,
          category: "bug",
          severity: "high",
          body: "Looks wrong.",
          kind: "observation",
          suggestedCode: null,
        },
      ]),
    );
    publishCommentMock.mockRejectedValue(new Error("403 Forbidden"));

    const result = await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

    expect(result).toEqual({
      ok: true,
      value: { reviewRunId: reviewRun.id.value, status: "completed" },
    });
    const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.status).toBe("completed");
    expect(finalSave.errorReason).toBe("403 Forbidden");
  });

  describe("welcome message", () => {
    it("is published once, on a repo's first completed run", async () => {
      const { useCase, reviewRunRepository } = makeDeps();
      reviewRunRepository.findByRepoId.mockResolvedValue({ reviewRuns: [], total: 0 });
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse());

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(publishGeneralCommentMock).toHaveBeenCalledTimes(1);
      expect(publishGeneralCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({ repoFullName: "org/repo", prNumber: 42 }),
      );
    });

    it("is skipped when the repo already has a prior completed run", async () => {
      const { useCase, reviewRunRepository } = makeDeps();
      reviewRunRepository.findByRepoId.mockResolvedValue({ reviewRuns: [], total: 1 });
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse());

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(publishGeneralCommentMock).not.toHaveBeenCalled();
    });

    it("does not fail the run when the welcome comment itself fails to publish", async () => {
      const { useCase, reviewRunRepository } = makeDeps();
      reviewRunRepository.findByRepoId.mockResolvedValue({ reviewRuns: [], total: 0 });
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse());
      publishGeneralCommentMock.mockRejectedValue(new Error("rate limited"));

      const result = await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(result).toEqual({
        ok: true,
        value: { reviewRunId: reviewRun.id.value, status: "completed" },
      });
      const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
      expect(finalSave.status).toBe("completed");
      expect(finalSave.errorReason).toBeNull();
    });

    it("does not count this run's own status when checking for prior completed runs", async () => {
      const { useCase, reviewRunRepository } = makeDeps();
      reviewRunRepository.findByRepoId.mockResolvedValue({ reviewRuns: [], total: 0 });
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse());

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(reviewRunRepository.findByRepoId).toHaveBeenCalledWith(repo.id.value, {
        status: "completed",
      });
    });
  });

  describe("overview comment", () => {
    it("is published when the model returns zero comments with an overview", async () => {
      const { useCase, reviewRunRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse([], "Clean, well-tested change."));

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(publishGeneralCommentMock).toHaveBeenCalledTimes(1);
      expect(publishGeneralCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          repoFullName: "org/repo",
          prNumber: 42,
          body: expect.stringContaining("Clean, well-tested change."),
        }),
      );
    });

    it("is skipped when there is no overview", async () => {
      const { useCase, reviewRunRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse());

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(publishGeneralCommentMock).not.toHaveBeenCalled();
    });

    it("is skipped when the model returns real comments even if it also sent an overview", async () => {
      const { useCase, reviewRunRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(
        validLlmResponse(
          [
            {
              file: "a.ts",
              line: 1,
              category: "bug",
              severity: "high",
              body: "Looks wrong.",
              kind: "observation",
              suggestedCode: null,
            },
          ],
          "Should not appear.",
        ),
      );
      publishCommentMock.mockResolvedValue({ externalId: "gh-1" });

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(publishGeneralCommentMock).not.toHaveBeenCalled();
    });

    it("does not fail the run when the overview comment itself fails to publish", async () => {
      const { useCase, reviewRunRepository } = makeDeps();
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse([], "Clean, well-tested change."));
      publishGeneralCommentMock.mockRejectedValue(new Error("rate limited"));

      const result = await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(result).toEqual({
        ok: true,
        value: { reviewRunId: reviewRun.id.value, status: "completed" },
      });
      const finalSave = reviewRunRepository.save.mock.calls.at(-1)?.[0];
      expect(finalSave.status).toBe("completed");
      expect(finalSave.errorReason).toBeNull();
    });

    it("can be published alongside the welcome message on a repo's very first completed run", async () => {
      const { useCase, reviewRunRepository } = makeDeps();
      reviewRunRepository.findByRepoId.mockResolvedValue({ reviewRuns: [], total: 0 });
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse([], "Clean, well-tested change."));

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(publishGeneralCommentMock).toHaveBeenCalledTimes(2);
    });
  });

  it("passes repoConfig.reviewLanguage through to the ReviewContext unchanged", async () => {
    const { useCase, reviewRunRepository, repoConfigRepository } = makeDeps();
    repoConfigRepository.findByRepoId.mockResolvedValue(
      repoConfig.update({ reviewLanguage: "es" }),
    );
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    generateMock.mockResolvedValue(validLlmResponse());

    await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

    const systemInstruction = generateMock.mock.calls[0][0].systemInstruction as string;
    expect(systemInstruction).toContain("Spanish");
  });

  describe("custom instructions from repoConfig.promptId", () => {
    it("passes the selected prompt's content as customInstructions when repoConfig.promptId is set and the prompt is found", async () => {
      const { useCase, reviewRunRepository, repoConfigRepository, promptRepository } = makeDeps();
      const prompt = Prompt.create({
        userId: repo.userId,
        name: "Focus on security",
        content: "Only flag security issues; ignore style nitpicks.",
      });
      repoConfigRepository.findByRepoId.mockResolvedValue(
        repoConfig.update({ promptId: prompt.id.value }),
      );
      promptRepository.findById.mockResolvedValue(prompt);
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse());

      await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(promptRepository.findById).toHaveBeenCalledWith(prompt.id.value);
      const systemInstruction = generateMock.mock.calls[0][0].systemInstruction as string;
      expect(systemInstruction).toContain(prompt.content);
    });

    it("passes undefined customInstructions when repoConfig.promptId is null — identical to pre-PRD behavior", async () => {
      const { useCase, reviewRunRepository, repoConfigRepository, promptRepository } = makeDeps();
      repoConfigRepository.findByRepoId.mockResolvedValue(repoConfig.update({ promptId: null }));
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse());

      const result = await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(result).toEqual({
        ok: true,
        value: { reviewRunId: reviewRun.id.value, status: "completed" },
      });
      expect(promptRepository.findById).not.toHaveBeenCalled();
      const systemInstruction = generateMock.mock.calls[0][0].systemInstruction as string;
      expect(systemInstruction).not.toContain("written by this repository's maintainer");
    });

    it("completes normally with undefined customInstructions when promptId is set but the prompt can't be found (theoretical inconsistency, never a run failure)", async () => {
      const { useCase, reviewRunRepository, repoConfigRepository, promptRepository } = makeDeps();
      const missingPromptId = "11111111-1111-4111-8111-111111111111";
      repoConfigRepository.findByRepoId.mockResolvedValue(
        repoConfig.update({ promptId: missingPromptId }),
      );
      promptRepository.findById.mockResolvedValue(null);
      const reviewRun = makeReviewRun();
      reviewRunRepository.findById.mockResolvedValue(reviewRun);
      generateMock.mockResolvedValue(validLlmResponse());

      const result = await useCase.execute({ reviewRunId: reviewRun.id.value, diff: emptyDiff });

      expect(result).toEqual({
        ok: true,
        value: { reviewRunId: reviewRun.id.value, status: "completed" },
      });
      expect(promptRepository.findById).toHaveBeenCalledWith(missingPromptId);
      const systemInstruction = generateMock.mock.calls[0][0].systemInstruction as string;
      expect(systemInstruction).not.toContain("written by this repository's maintainer");
    });
  });
});
