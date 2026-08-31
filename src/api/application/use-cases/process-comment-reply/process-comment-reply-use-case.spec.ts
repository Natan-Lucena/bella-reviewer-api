import { beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

const generateMock = vi.fn();
const getFileContentMock = vi.fn();
const replyToCommentMock = vi.fn();

// Same precedent as process-review-run-use-case.spec.ts: review()/publish
// helpers aside, this use case builds its own concrete adapters from
// decrypted credentials rather than receiving them via DI, so only the
// concrete adapters need mocking.
vi.mock("../../../integration/gemini/gemini-llm-provider", () => ({
  GeminiLlmProvider: vi.fn().mockImplementation(() => ({ generate: generateMock })),
}));

vi.mock("../../../integration/github/github-scm-adapter", () => ({
  GithubScmAdapter: vi.fn().mockImplementation(() => ({
    getFileContent: getFileContentMock,
    replyToComment: replyToCommentMock,
  })),
}));

import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { Comment } from "../../../domain/entities/comment.entity";
import { CommentReply } from "../../../domain/entities/comment-reply.entity";
import { Credential } from "../../../domain/entities/credential.entity";
import { Prompt } from "../../../domain/entities/prompt.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { CommentReplyRepository } from "../../../domain/repository/comment-reply.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { PromptRepository } from "../../../domain/repository/prompt.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ProcessCommentReplyUseCase } from "./process-comment-reply-use-case";

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

function makeOriginalComment(overrides: Partial<Parameters<typeof Comment.create>[0]> = {}) {
  const comment = Comment.create({
    reviewRunId: "review-run-placeholder",
    reviewTurnId: "turn-1",
    file: "src/index.ts",
    line: 10,
    endLine: 10,
    category: "bug",
    severity: "high",
    body: "Off-by-one error here.",
    kind: "actionable",
    suggestedCode: "return items[i - 1];",
    contextBefore: "function example() {",
    contextAfter: "}",
    ...overrides,
  });
  // Comment.create defaults status to "generated" — the original comment
  // needs an externalId (required by replyToComment) and "published" status
  // to be realistic; markApplyStatus doesn't set externalId, so it's
  // patched directly for test setup purposes only.
  comment.externalId = "gh-thread-1";
  comment.status = "published";
  return comment;
}

function makeCommentReply(overrides: Partial<{ commentId: string }> = {}) {
  return CommentReply.create({
    commentId: overrides.commentId ?? "comment-placeholder",
    humanExternalId: "gh-human-1",
    humanBody: "Can you turn this into a for loop instead?",
    humanAuthor: "octocat",
  });
}

function makeDeps(overrides: { withCredentials?: boolean } = { withCredentials: true }) {
  const commentReplyRepository = mock<CommentReplyRepository>();
  const commentRepository = mock<CommentRepository>();
  const reviewRunRepository = mock<ReviewRunRepository>();
  const repoRepository = mock<RepoRepository>();
  const repoConfigRepository = mock<RepoConfigRepository>();
  const credentialRepository = mock<CredentialRepository>();
  const promptRepository = mock<PromptRepository>();

  repoRepository.findById.mockResolvedValue(repo);
  repoConfigRepository.findByRepoId.mockResolvedValue(repoConfig);
  commentReplyRepository.findByCommentId.mockResolvedValue([]);
  commentRepository.findByReviewRunId.mockResolvedValue([]);
  if (overrides.withCredentials !== false) {
    credentialRepository.findByRepoIdAndType.mockImplementation(async (_repoId, type) =>
      type === "llm" ? llmCredential : type === "scm" ? scmCredential : null,
    );
  } else {
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);
  }

  const useCase = new ProcessCommentReplyUseCase(
    commentReplyRepository,
    commentRepository,
    reviewRunRepository,
    repoRepository,
    repoConfigRepository,
    credentialRepository,
    promptRepository,
  );

  return {
    useCase,
    commentReplyRepository,
    commentRepository,
    reviewRunRepository,
    repoRepository,
    repoConfigRepository,
    credentialRepository,
    promptRepository,
  };
}

function validLlmResponse(overrides: {
  body?: string;
  suggestedCode?: string | null;
  category?: string;
} = {}) {
  return {
    content: JSON.stringify({
      body: overrides.body ?? "Sure, here's a for-loop version.",
      suggestedCode: overrides.suggestedCode ?? null,
      category: overrides.category ?? "fix",
    }),
    tokensInput: 50,
    tokensOutput: 10,
    tokensReasoning: 0,
  };
}

// Standard wiring for a happy-path test: a ReviewRun, an original Comment
// belonging to it, and a CommentReply targeting that Comment.
function wireHappyPath(deps: ReturnType<typeof makeDeps>) {
  const reviewRun = makeReviewRun();
  const originalComment = makeOriginalComment({ reviewRunId: reviewRun.id.value });
  const commentReply = makeCommentReply({ commentId: originalComment.id.value });

  deps.commentReplyRepository.findById.mockResolvedValue(commentReply);
  deps.commentRepository.findById.mockResolvedValue(originalComment);
  deps.reviewRunRepository.findById.mockResolvedValue(reviewRun);

  return { reviewRun, originalComment, commentReply };
}

describe("ProcessCommentReplyUseCase", () => {
  beforeEach(() => {
    generateMock.mockReset();
    getFileContentMock.mockReset();
    replyToCommentMock.mockReset();
  });

  it("returns comment_reply_not_found without touching anything else", async () => {
    const deps = makeDeps();
    deps.commentReplyRepository.findById.mockResolvedValue(null);

    const result = await deps.useCase.execute({
      commentReplyId: "missing",
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: null,
    });

    expect(result).toEqual({ ok: false, error: "comment_reply_not_found" });
    expect(deps.commentRepository.findById).not.toHaveBeenCalled();
  });

  it("marks the reply processing before doing anything else", async () => {
    const deps = makeDeps();
    const { commentReply } = wireHappyPath(deps);
    generateMock.mockResolvedValue(validLlmResponse());
    replyToCommentMock.mockResolvedValue({ externalId: "gh-reply-1" });
    const statusesAtSaveTime: string[] = [];
    deps.commentReplyRepository.save.mockImplementation(async (r) => {
      statusesAtSaveTime.push(r.status);
    });

    await deps.useCase.execute({
      commentReplyId: commentReply.id.value,
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: null,
    });

    expect(statusesAtSaveTime[0]).toBe("processing");
  });

  it("completes the happy path: generation and publish succeed, category/cost recorded", async () => {
    const deps = makeDeps();
    const { commentReply } = wireHappyPath(deps);
    generateMock.mockResolvedValue(validLlmResponse({ category: "fix" }));
    replyToCommentMock.mockResolvedValue({ externalId: "gh-reply-1" });

    const result = await deps.useCase.execute({
      commentReplyId: commentReply.id.value,
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: "Details.",
    });

    expect(result).toEqual({
      ok: true,
      value: { commentReplyId: commentReply.id.value, status: "completed" },
    });
    const finalSave = deps.commentReplyRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.status).toBe("completed");
    expect(finalSave.category).toBe("fix");
    expect(finalSave.bellaBody).toBe("Sure, here's a for-loop version.");
    expect(finalSave.bellaExternalId).toBe("gh-reply-1");
    expect(finalSave.errorReason).toBeNull();
    // gemini-2.5-flash: 50 input tokens * $0.30/1M + 10 output tokens (0
    // reasoning) * $2.50/1M.
    expect(finalSave.estimatedCost).toBeCloseTo(0.000040, 10);
    expect(finalSave.completedAt).toBeInstanceOf(Date);
  });

  it("fails with a specific reason when the LLM credential is missing", async () => {
    const deps = makeDeps({ withCredentials: false });
    deps.credentialRepository.findByRepoIdAndType.mockImplementation(async (_repoId, type) =>
      type === "scm" ? scmCredential : null,
    );
    const { commentReply } = wireHappyPath(deps);

    const result = await deps.useCase.execute({
      commentReplyId: commentReply.id.value,
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: null,
    });

    expect(result).toEqual({
      ok: true,
      value: { commentReplyId: commentReply.id.value, status: "failed" },
    });
    const finalSave = deps.commentReplyRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.status).toBe("failed");
    expect(finalSave.errorReason).toBe("LLM credential not configured");
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("fails with a specific reason when the SCM credential is missing", async () => {
    const deps = makeDeps({ withCredentials: false });
    deps.credentialRepository.findByRepoIdAndType.mockImplementation(async (_repoId, type) =>
      type === "llm" ? llmCredential : null,
    );
    const { commentReply } = wireHappyPath(deps);

    await deps.useCase.execute({
      commentReplyId: commentReply.id.value,
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: null,
    });

    const finalSave = deps.commentReplyRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.errorReason).toBe("SCM credential not configured");
  });

  it("fails with a specific reason when repo configuration is missing", async () => {
    const deps = makeDeps();
    deps.repoConfigRepository.findByRepoId.mockResolvedValue(null);
    const { commentReply } = wireHappyPath(deps);

    const result = await deps.useCase.execute({
      commentReplyId: commentReply.id.value,
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: null,
    });

    expect(result).toEqual({
      ok: true,
      value: { commentReplyId: commentReply.id.value, status: "failed" },
    });
    const finalSave = deps.commentReplyRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.errorReason).toBe("Repository configuration not found");
  });

  it("fails when LLM generation throws", async () => {
    const deps = makeDeps();
    const { commentReply } = wireHappyPath(deps);
    generateMock.mockRejectedValue(new Error("provider error"));

    const result = await deps.useCase.execute({
      commentReplyId: commentReply.id.value,
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: null,
    });

    expect(result).toEqual({
      ok: true,
      value: { commentReplyId: commentReply.id.value, status: "failed" },
    });
    const finalSave = deps.commentReplyRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.status).toBe("failed");
    expect(finalSave.errorReason).toBe("provider error");
    expect(replyToCommentMock).not.toHaveBeenCalled();
  });

  it("fails when the LLM response fails to parse", async () => {
    const deps = makeDeps();
    const { commentReply } = wireHappyPath(deps);
    generateMock.mockResolvedValue({
      content: "not json",
      tokensInput: 10,
      tokensOutput: 5,
      tokensReasoning: 0,
    });

    const result = await deps.useCase.execute({
      commentReplyId: commentReply.id.value,
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: null,
    });

    expect(result).toEqual({
      ok: true,
      value: { commentReplyId: commentReply.id.value, status: "failed" },
    });
  });

  it("stays completed (never failed) with an errorReason when publishing fails after successful generation", async () => {
    const deps = makeDeps();
    const { commentReply } = wireHappyPath(deps);
    generateMock.mockResolvedValue(validLlmResponse());
    replyToCommentMock.mockRejectedValue(new Error("403 Forbidden"));

    const result = await deps.useCase.execute({
      commentReplyId: commentReply.id.value,
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: null,
    });

    expect(result).toEqual({
      ok: true,
      value: { commentReplyId: commentReply.id.value, status: "completed" },
    });
    const finalSave = deps.commentReplyRepository.save.mock.calls.at(-1)?.[0];
    expect(finalSave.status).toBe("completed");
    expect(finalSave.errorReason).toBe("403 Forbidden");
    // Generation output is still recorded even though publish failed.
    expect(finalSave.bellaBody).toBe("Sure, here's a for-loop version.");
  });

  describe("suggestedCode safety", () => {
    it("publishes suggestedCode as-is when the anchor still relocates in the current file", async () => {
      const deps = makeDeps();
      const { commentReply } = wireHappyPath(deps);
      generateMock.mockResolvedValue(
        validLlmResponse({ suggestedCode: "for (let j = i - 1; j >= 0; j--) { return items[j]; }" }),
      );
      getFileContentMock.mockResolvedValue(
        ["function example() {", "  return items[i - 1];", "}"].join("\n"),
      );
      replyToCommentMock.mockResolvedValue({ externalId: "gh-reply-1" });

      await deps.useCase.execute({
        commentReplyId: commentReply.id.value,
        prNumber: 42,
        commitSha: "def456",
        prTitle: "Fix bug",
        prDescription: null,
      });

      expect(replyToCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedCode: "for (let j = i - 1; j >= 0; j--) { return items[j]; }",
        }),
      );
      const finalSave = deps.commentReplyRepository.save.mock.calls.at(-1)?.[0];
      expect(finalSave.bellaSuggestedCode).toBe(
        "for (let j = i - 1; j >= 0; j--) { return items[j]; }",
      );
    });

    it("degrades to text-only (never fails the reply) when the anchor can't be relocated in the current file", async () => {
      const deps = makeDeps();
      const { commentReply } = wireHappyPath(deps);
      generateMock.mockResolvedValue(
        validLlmResponse({ suggestedCode: "for (let j = i - 1; j >= 0; j--) { return items[j]; }" }),
      );
      // Neither contextBefore nor contextAfter appears anywhere — the
      // surrounding code has drifted since the original review.
      getFileContentMock.mockResolvedValue(
        ["totally different content", "no anchor here", "at all"].join("\n"),
      );
      replyToCommentMock.mockResolvedValue({ externalId: "gh-reply-1" });

      const result = await deps.useCase.execute({
        commentReplyId: commentReply.id.value,
        prNumber: 42,
        commitSha: "def456",
        prTitle: "Fix bug",
        prDescription: null,
      });

      expect(result).toEqual({
        ok: true,
        value: { commentReplyId: commentReply.id.value, status: "completed" },
      });
      expect(replyToCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedCode: null }),
      );
      const finalSave = deps.commentReplyRepository.save.mock.calls.at(-1)?.[0];
      expect(finalSave.bellaSuggestedCode).toBeNull();
    });

    it("skips the relocation check entirely when the model returned no suggestedCode", async () => {
      const deps = makeDeps();
      const { commentReply } = wireHappyPath(deps);
      generateMock.mockResolvedValue(validLlmResponse({ suggestedCode: null }));
      replyToCommentMock.mockResolvedValue({ externalId: "gh-reply-1" });

      await deps.useCase.execute({
        commentReplyId: commentReply.id.value,
        prNumber: 42,
        commitSha: "def456",
        prTitle: "Fix bug",
        prDescription: null,
      });

      expect(getFileContentMock).not.toHaveBeenCalled();
    });
  });

  describe("prompt context assembly", () => {
    it("passes prior completed exchanges chronologically, excluding this reply itself and any non-completed reply", async () => {
      const deps = makeDeps();
      const reviewRun = makeReviewRun();
      const originalComment = makeOriginalComment({ reviewRunId: reviewRun.id.value });
      const earlierReply = CommentReply.create({
        commentId: originalComment.id.value,
        humanExternalId: "gh-human-earlier",
        humanBody: "Why is this an issue?",
        humanAuthor: "octocat",
      });
      earlierReply.status = "completed";
      earlierReply.bellaBody = "Because it can throw for an empty array.";
      const stillProcessingReply = CommentReply.create({
        commentId: originalComment.id.value,
        humanExternalId: "gh-human-processing",
        humanBody: "Another question, still being answered.",
        humanAuthor: "octocat",
      });
      stillProcessingReply.status = "processing";
      const commentReply = makeCommentReply({ commentId: originalComment.id.value });

      deps.commentReplyRepository.findById.mockResolvedValue(commentReply);
      deps.commentRepository.findById.mockResolvedValue(originalComment);
      deps.reviewRunRepository.findById.mockResolvedValue(reviewRun);
      deps.commentReplyRepository.findByCommentId.mockResolvedValue([
        earlierReply,
        stillProcessingReply,
        commentReply,
      ]);
      generateMock.mockResolvedValue(validLlmResponse());
      replyToCommentMock.mockResolvedValue({ externalId: "gh-reply-1" });

      await deps.useCase.execute({
        commentReplyId: commentReply.id.value,
        prNumber: 42,
        commitSha: "abc123",
        prTitle: "Fix bug",
        prDescription: null,
      });

      const userContent = generateMock.mock.calls[0][0].userContent as string;
      expect(userContent).toContain("Why is this an issue?");
      expect(userContent).toContain("Because it can throw for an empty array.");
      expect(userContent).not.toContain("Another question, still being answered.");
    });

    it("passes other published comments from the same ReviewRun, excluding the thread's own original comment", async () => {
      const deps = makeDeps();
      const reviewRun = makeReviewRun();
      const originalComment = makeOriginalComment({ reviewRunId: reviewRun.id.value });
      const otherPublished = Comment.create({
        reviewRunId: reviewRun.id.value,
        reviewTurnId: "turn-1",
        file: "src/other.ts",
        line: 5,
        category: "style",
        severity: "low",
        body: "Consider renaming this variable.",
        kind: "observation",
      });
      otherPublished.status = "published";
      const notPublished = Comment.create({
        reviewRunId: reviewRun.id.value,
        reviewTurnId: "turn-1",
        file: "src/discarded.ts",
        line: 1,
        category: "style",
        severity: "low",
        body: "Should never appear in the prompt.",
        kind: "observation",
      });
      notPublished.status = "discarded";
      const commentReply = makeCommentReply({ commentId: originalComment.id.value });

      deps.commentReplyRepository.findById.mockResolvedValue(commentReply);
      deps.commentRepository.findById.mockResolvedValue(originalComment);
      deps.reviewRunRepository.findById.mockResolvedValue(reviewRun);
      deps.commentRepository.findByReviewRunId.mockResolvedValue([
        originalComment,
        otherPublished,
        notPublished,
      ]);
      generateMock.mockResolvedValue(validLlmResponse());
      replyToCommentMock.mockResolvedValue({ externalId: "gh-reply-1" });

      await deps.useCase.execute({
        commentReplyId: commentReply.id.value,
        prNumber: 42,
        commitSha: "abc123",
        prTitle: "Fix bug",
        prDescription: null,
      });

      const userContent = generateMock.mock.calls[0][0].userContent as string;
      expect(userContent).toContain("Consider renaming this variable.");
      expect(userContent).not.toContain("Should never appear in the prompt.");
      // Only counting occurrences of the original comment's own body text as
      // the "your original comment" line, not duplicated into otherComments.
      expect(userContent.match(/Off-by-one error here\./g)).toHaveLength(1);
    });

    it("passes the selected prompt's content as customInstructions when repoConfig.promptId is set", async () => {
      const deps = makeDeps();
      const prompt = Prompt.create({
        userId: repo.userId,
        name: "Focus on security",
        content: "Only flag security issues; ignore style nitpicks.",
      });
      deps.repoConfigRepository.findByRepoId.mockResolvedValue(
        repoConfig.update({ promptId: prompt.id.value }),
      );
      deps.promptRepository.findById.mockResolvedValue(prompt);
      const { commentReply } = wireHappyPath(deps);
      generateMock.mockResolvedValue(validLlmResponse());
      replyToCommentMock.mockResolvedValue({ externalId: "gh-reply-1" });

      await deps.useCase.execute({
        commentReplyId: commentReply.id.value,
        prNumber: 42,
        commitSha: "abc123",
        prTitle: "Fix bug",
        prDescription: null,
      });

      expect(deps.promptRepository.findById).toHaveBeenCalledWith(prompt.id.value);
      const systemInstruction = generateMock.mock.calls[0][0].systemInstruction as string;
      expect(systemInstruction).toContain(prompt.content);
    });
  });
});
