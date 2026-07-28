import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ListReviewRunsController } from "./list-review-runs-controller";
import { ListReviewRunsUseCase } from "./list-review-runs-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeUseCase(): ListReviewRunsUseCase {
  return new ListReviewRunsUseCase(
    mock<RepoRepository>(),
    mock<ReviewRunRepository>(),
    mock<CommentRepository>(),
  );
}

describe("ListReviewRunsController", () => {
  it("returns 400 for an invalid status filter", async () => {
    const controller = new ListReviewRunsController(makeUseCase());
    const req = {
      userId: "user-1",
      params: { id: "repo-1" },
      query: { status: "unknown" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("applies default limit/offset and returns 200", async () => {
    const useCase = makeUseCase();
    const executeSpy = vi
      .spyOn(useCase, "execute")
      .mockResolvedValue({ ok: true, value: { reviewRuns: [], total: 0 } });
    const controller = new ListReviewRunsController(useCase);
    const req = { userId: "user-1", params: { id: "repo-1" }, query: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(executeSpy).toHaveBeenCalledWith({
      userId: "user-1",
      repoId: "repo-1",
      status: undefined,
      limit: 20,
      offset: 0,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 when the repo isn't found", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: false, error: "repo_not_found" });
    const controller = new ListReviewRunsController(useCase);
    const req = { userId: "user-1", params: { id: "repo-1" }, query: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
