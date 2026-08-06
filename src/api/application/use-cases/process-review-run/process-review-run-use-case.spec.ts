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

vi.mock("../../../integration/github/github-scm-adapter", () => ({
  GithubScmAdapter: vi.fn().mockImplementation(() => ({
    publishComment: publishCommentMock,
    publishGeneralComment: publishGeneralCommentMock,
    getDiff: vi.fn(),
  })),
}));

import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { Diff } from "../../../domain/ports/scm-adapter.port";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReviewTurnRepository } from "../../../domain/repository/review-turn.repository";
import { ProcessReviewRunUseCase } from "./process-review-run-use-case";

const emptyDiff: Diff = { files: [] };

const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
const repoConfig = RepoConfig.create({
  repoId: repo.id.value,
  model: "gemini-2.5-flash",
  tokenLimit: 100000,
});
const llmCredential = Credential.createLlm({
  repoId: repo.id.value,
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

  repoRepository.findById.mockResolvedValue(repo);
  repoConfigRepository.findByRepoId.mockResolvedValue(repoConfig);
  // Default: this repo already has a prior completed run, so the welcome
  // message is skipped unless a test explicitly overrides this to simulate
  // a brand-new repo. Keeps every test not about the welcome message itself
  // from having to think about it.
  reviewRunRepository.findByRepoId.mockResolvedValue({ reviewRuns: [], total: 1 });
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
  );

  return {
    useCase,
    reviewRunRepository,
    repoRepository,
    repoConfigRepository,
    credentialRepository,
    reviewTurnRepository,
    commentRepository,
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

  it("completes successfully, persisting turns/comments and publishing them", async () => {
    const { useCase, reviewRunRepository, reviewTurnRepository, commentRepository } = makeDeps();
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    generateMock.mockResolvedValue(
      validLlmResponse([
        { file: "a.ts", line: 1, category: "bug", severity: "high", body: "Looks wrong." },
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
    // Comment.create — the review core doesn't classify comments yet, so
    // every one is hardcoded to "observation" here until it does.
    expect(savedComment.file).toBe("a.ts");
    expect(savedComment.line).toBe(1);
    expect(savedComment.category).toBe("bug");
    expect(savedComment.severity).toBe("high");
    expect(savedComment.body).toBe("Looks wrong.");
    expect(savedComment.kind).toBe("observation");
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
    // Known gap, not corrected here: nothing in this use case ever computes
    // a real estimatedCost — a completed run with real token usage is
    // persisted with estimatedCost still null.
    expect(finalSave.estimatedCost).toBeNull();
  });

  it("completes (not failed) when the single turn's LLM call fails, with zero comments persisted", async () => {
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
    expect(commentRepository.save).not.toHaveBeenCalled();
    expect(publishCommentMock).not.toHaveBeenCalled();
  });

  it("stays completed but records the errorReason when publishing a comment fails", async () => {
    const { useCase, reviewRunRepository } = makeDeps();
    const reviewRun = makeReviewRun();
    reviewRunRepository.findById.mockResolvedValue(reviewRun);
    generateMock.mockResolvedValue(
      validLlmResponse([
        { file: "a.ts", line: 1, category: "bug", severity: "high", body: "Looks wrong." },
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
          [{ file: "a.ts", line: 1, category: "bug", severity: "high", body: "Looks wrong." }],
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
});
