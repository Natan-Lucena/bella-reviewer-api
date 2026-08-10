import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

const getFileContentMock = vi.fn<() => Promise<string | null>>();
vi.mock("../../../integration/github/github-scm-adapter", () => ({
  GithubScmAdapter: vi.fn().mockImplementation(() => ({ getFileContent: getFileContentMock })),
}));

import { encrypt } from "../../../../shared/infra/crypto/encryption";
import { Comment } from "../../../domain/entities/comment.entity";
import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { CommentApplyEventRepository } from "../../../domain/repository/comment-apply-event.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReconcileThreadResolutionUseCase } from "./reconcile-thread-resolution-use-case";

function makePendingComment(
  overrides: Partial<{ contextBefore: string | null; contextAfter: string | null }> = {},
): Comment {
  const comment = Comment.create({
    reviewRunId: "run-1",
    reviewTurnId: "turn-1",
    file: "src/a.ts",
    line: 2,
    category: "bug",
    severity: "high",
    body: "Off-by-one.",
    kind: "actionable",
    suggestedCode: "return items[i - 1];",
    contextBefore: overrides.contextBefore ?? null,
    contextAfter: overrides.contextAfter ?? null,
  });
  comment.status = "published";
  comment.externalId = "gh-1";
  return comment;
}

function makeDeps() {
  const repoRepository = mock<RepoRepository>();
  const credentialRepository = mock<CredentialRepository>();
  const commentRepository = mock<CommentRepository>();
  const commentApplyEventRepository = mock<CommentApplyEventRepository>();

  repoRepository.findById.mockResolvedValue(
    Repo.create({ userId: "user-1", fullName: "org/repo" }),
  );
  credentialRepository.findByRepoIdAndType.mockResolvedValue(
    Credential.createScm({ repoId: "repo-1", encryptedSecret: encrypt("pat") }),
  );

  const useCase = new ReconcileThreadResolutionUseCase(
    repoRepository,
    credentialRepository,
    commentRepository,
    commentApplyEventRepository,
  );

  return {
    useCase,
    repoRepository,
    credentialRepository,
    commentRepository,
    commentApplyEventRepository,
  };
}

describe("ReconcileThreadResolutionUseCase", () => {
  it("returns repo_not_found when the repo doesn't exist", async () => {
    const { useCase, repoRepository } = makeDeps();
    repoRepository.findById.mockResolvedValue(null);

    const result = await useCase.execute({
      repoId: "repo-1",
      externalId: "gh-1",
      headCommitSha: "sha",
    });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
  });

  it("returns scm_credential_missing when there's no SCM credential", async () => {
    const { useCase, credentialRepository } = makeDeps();
    credentialRepository.findByRepoIdAndType.mockResolvedValue(null);

    const result = await useCase.execute({
      repoId: "repo-1",
      externalId: "gh-1",
      headCommitSha: "sha",
    });

    expect(result).toEqual({ ok: false, error: "scm_credential_missing" });
  });

  it("no-ops when no comment has that externalId", async () => {
    const { useCase, commentRepository, commentApplyEventRepository } = makeDeps();
    commentRepository.findByExternalId.mockResolvedValue(null);

    const result = await useCase.execute({
      repoId: "repo-1",
      externalId: "gh-unknown",
      headCommitSha: "sha",
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(getFileContentMock).not.toHaveBeenCalled();
    expect(commentRepository.save).not.toHaveBeenCalled();
    expect(commentApplyEventRepository.save).not.toHaveBeenCalled();
  });

  it("no-ops when the comment isn't pending anymore", async () => {
    const { useCase, commentRepository } = makeDeps();
    const comment = makePendingComment().markApplyStatus("applied_manual", {
      commitSha: "earlier-sha",
      detectionMethod: "content_match",
    });
    commentRepository.findByExternalId.mockResolvedValue(comment);

    const result = await useCase.execute({
      repoId: "repo-1",
      externalId: "gh-1",
      headCommitSha: "sha",
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(getFileContentMock).not.toHaveBeenCalled();
    expect(commentRepository.save).not.toHaveBeenCalled();
  });

  it("marks applied_manual/content_match when the line matches suggestedCode", async () => {
    const { useCase, commentRepository, commentApplyEventRepository } = makeDeps();
    commentRepository.findByExternalId.mockResolvedValue(makePendingComment());
    getFileContentMock.mockResolvedValue("function getLast(items) {\n  return items[i - 1];\n}");

    const result = await useCase.execute({
      repoId: "repo-1",
      externalId: "gh-1",
      headCommitSha: "sha",
    });

    expect(result).toEqual({ ok: true, value: undefined });
    const saved = commentRepository.save.mock.calls[0][0];
    expect(saved.applyStatus).toBe("applied_manual");
    expect(saved.detectionMethod).toBe("content_match");
    expect(commentApplyEventRepository.save).toHaveBeenCalledTimes(1);
  });

  it("marks dismissed/thread_resolved_without_match when the line doesn't match", async () => {
    const { useCase, commentRepository } = makeDeps();
    commentRepository.findByExternalId.mockResolvedValue(makePendingComment());
    getFileContentMock.mockResolvedValue("function getLast(items) {\n  return null;\n}");

    const result = await useCase.execute({
      repoId: "repo-1",
      externalId: "gh-1",
      headCommitSha: "sha",
    });

    expect(result).toEqual({ ok: true, value: undefined });
    const saved = commentRepository.save.mock.calls[0][0];
    expect(saved.applyStatus).toBe("dismissed");
    expect(saved.detectionMethod).toBe("thread_resolved_without_match");
  });

  it("marks dismissed when the file no longer exists", async () => {
    const { useCase, commentRepository } = makeDeps();
    commentRepository.findByExternalId.mockResolvedValue(makePendingComment());
    getFileContentMock.mockResolvedValue(null);

    await useCase.execute({ repoId: "repo-1", externalId: "gh-1", headCommitSha: "sha" });

    const saved = commentRepository.save.mock.calls[0][0];
    expect(saved.applyStatus).toBe("dismissed");
  });

  describe("line drift (DT-01)", () => {
    it("relocates via context and marks applied_manual/content_match_relocated when unrelated lines were inserted above", async () => {
      const { useCase, commentRepository, commentApplyEventRepository } = makeDeps();
      commentRepository.findByExternalId.mockResolvedValue(
        makePendingComment({ contextBefore: "function getLast(items) {", contextAfter: "}" }),
      );
      getFileContentMock.mockResolvedValue(
        [
          "import a from 'a';",
          "import b from 'b';",
          "function getLast(items) {",
          "  return items[i - 1];",
          "}",
        ].join("\n"),
      );

      const result = await useCase.execute({
        repoId: "repo-1",
        externalId: "gh-1",
        headCommitSha: "sha",
      });

      expect(result).toEqual({ ok: true, value: undefined });
      const saved = commentRepository.save.mock.calls[0][0];
      expect(saved.applyStatus).toBe("applied_manual");
      expect(saved.detectionMethod).toBe("content_match_relocated");
      expect(commentApplyEventRepository.save).toHaveBeenCalledTimes(1);
    });

    it("dismisses (never a crash or a false pending) when the line drifted and can't be relocated with confidence", async () => {
      const { useCase, commentRepository } = makeDeps();
      commentRepository.findByExternalId.mockResolvedValue(
        makePendingComment({ contextBefore: "function getLast(items) {", contextAfter: "}" }),
      );
      getFileContentMock.mockResolvedValue("totally\ndifferent\nfile\ncontent");

      const result = await useCase.execute({
        repoId: "repo-1",
        externalId: "gh-1",
        headCommitSha: "sha",
      });

      expect(result).toEqual({ ok: true, value: undefined });
      const saved = commentRepository.save.mock.calls[0][0];
      expect(saved.applyStatus).toBe("dismissed");
      expect(saved.detectionMethod).toBe("thread_resolved_without_match");
    });
  });
});
