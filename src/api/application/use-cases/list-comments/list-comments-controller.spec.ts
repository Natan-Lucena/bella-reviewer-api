import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { ListCommentsController } from "./list-comments-controller";
import { ListCommentsUseCase } from "./list-comments-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeUseCase(): ListCommentsUseCase {
  return new ListCommentsUseCase(
    mock<RepoRepository>(),
    mock<CommentRepository>(),
    mock<ReviewRunRepository>(),
  );
}

describe("ListCommentsController", () => {
  it("returns 400 for an invalid severity filter", async () => {
    const controller = new ListCommentsController(makeUseCase());
    const req = {
      userId: "user-1",
      params: { id: "repo-1" },
      query: { severity: "urgent" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("combines multiple filters and forwards them to the use case", async () => {
    const useCase = makeUseCase();
    const executeSpy = vi
      .spyOn(useCase, "execute")
      .mockResolvedValue({ ok: true, value: { comments: [], total: 0 } });
    const controller = new ListCommentsController(useCase);
    const req = {
      userId: "user-1",
      params: { id: "repo-1" },
      query: { category: "security", severity: "critical" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(executeSpy).toHaveBeenCalledWith({
      userId: "user-1",
      repoId: "repo-1",
      category: "security",
      severity: "critical",
      limit: 20,
      offset: 0,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 when the repo isn't found", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: false, error: "repo_not_found" });
    const controller = new ListCommentsController(useCase);
    const req = { userId: "user-1", params: { id: "repo-1" }, query: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
