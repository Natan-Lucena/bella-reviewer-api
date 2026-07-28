import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ReviewTurnRepository } from "../../../domain/repository/review-turn.repository";
import { GetReviewRunDetailController } from "./get-review-run-detail-controller";
import { GetReviewRunDetailUseCase } from "./get-review-run-detail-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeUseCase(): GetReviewRunDetailUseCase {
  return new GetReviewRunDetailUseCase(
    mock<RepoRepository>(),
    mock<ReviewRunRepository>(),
    mock<ReviewTurnRepository>(),
    mock<CommentRepository>(),
  );
}

describe("GetReviewRunDetailController", () => {
  it("returns 404 when the repo isn't found", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: false, error: "repo_not_found" });
    const controller = new GetReviewRunDetailController(useCase);
    const req = {
      userId: "user-1",
      params: { id: "repo-1", runId: "run-1" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "repo_not_found" }) }),
    );
  });

  it("returns 404 when the run isn't found (or belongs to another repo)", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: false, error: "review_run_not_found" });
    const controller = new GetReviewRunDetailController(useCase);
    const req = {
      userId: "user-1",
      params: { id: "repo-1", runId: "run-1" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "review_run_not_found" }) }),
    );
  });

  it("returns 200 with the run detail", async () => {
    const useCase = makeUseCase();
    const executeSpy = vi.spyOn(useCase, "execute").mockResolvedValue({
      ok: true,
      value: {
        id: "run-1",
        prNumber: 42,
        commitSha: "abc123",
        status: "completed",
        errorReason: null,
        turns: [],
        comments: [],
      },
    });
    const controller = new GetReviewRunDetailController(useCase);
    const req = {
      userId: "user-1",
      params: { id: "repo-1", runId: "run-1" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(executeSpy).toHaveBeenCalledWith({ userId: "user-1", repoId: "repo-1", runId: "run-1" });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
