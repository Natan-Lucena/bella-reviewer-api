import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { CommentRepository } from "../../../domain/repository/comment.repository";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReviewTurnRepository } from "../../../domain/repository/review-turn.repository";
import { ProcessReviewRunController } from "./process-review-run-controller";
import { ProcessReviewRunUseCase } from "./process-review-run-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeUseCase(): ProcessReviewRunUseCase {
  return new ProcessReviewRunUseCase(
    mock<ReviewRunRepository>(),
    mock<RepoRepository>(),
    mock<RepoConfigRepository>(),
    mock<CredentialRepository>(),
    mock<ReviewTurnRepository>(),
    mock<CommentRepository>(),
  );
}

describe("ProcessReviewRunController", () => {
  it("returns 400 when the body fails validation", async () => {
    const controller = new ProcessReviewRunController(makeUseCase());
    const req = { body: {}, params: { reviewRunId: "run-1" } } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "validation_error" }) }),
    );
  });

  it("returns 404 when the review run doesn't exist", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: false, error: "review_run_not_found" });
    const controller = new ProcessReviewRunController(useCase);
    const req = {
      body: { diff: { files: [] } },
      params: { reviewRunId: "missing" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 200 with the result body for both completed and failed outcomes", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({
      ok: true,
      value: { reviewRunId: "run-1", status: "failed" },
    });
    const controller = new ProcessReviewRunController(useCase);
    const req = {
      body: { diff: { files: [] } },
      params: { reviewRunId: "run-1" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ reviewRunId: "run-1", status: "failed" });
  });

  it("passes prTitle/prDescription and the reviewRunId from params to the use case", async () => {
    const useCase = makeUseCase();
    const executeSpy = vi
      .spyOn(useCase, "execute")
      .mockResolvedValue({ ok: true, value: { reviewRunId: "run-1", status: "completed" } });
    const controller = new ProcessReviewRunController(useCase);
    const req = {
      body: { diff: { files: [] }, prTitle: "Fix bug", prDescription: "Details." },
      params: { reviewRunId: "run-1" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(executeSpy).toHaveBeenCalledWith({
      reviewRunId: "run-1",
      diff: { files: [] },
      prTitle: "Fix bug",
      prDescription: "Details.",
    });
  });
});
