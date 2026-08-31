import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { CommentReplyRepository } from "../../../domain/repository/comment-reply.repository";
import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { GetCostStatsController } from "./get-cost-stats-controller";
import { GetCostStatsUseCase } from "./get-cost-stats-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeUseCase(): GetCostStatsUseCase {
  return new GetCostStatsUseCase(
    mock<RepoRepository>(),
    mock<CommentRepository>(),
    mock<CommentReplyRepository>(),
  );
}

function sampleValue() {
  return {
    totalCost: 10,
    totalCostByRunType: [
      { runType: "review" as const, totalCost: 7, count: 2 },
      { runType: "comment_reply" as const, totalCost: 3, count: 1 },
    ],
    breakdown: [{ category: "bug", runType: "review" as const, totalCost: 7, count: 2 }],
    previousPeriod: { totalCost: 5 },
  };
}

describe("GetCostStatsController", () => {
  it("returns 400 for an invalid period", async () => {
    const controller = new GetCostStatsController(makeUseCase());
    const req = {
      userId: "user-1",
      params: { id: "repo-1" },
      query: { period: "invalid" },
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("defaults to a 30d period when none is provided", async () => {
    const useCase = makeUseCase();
    const executeSpy = vi
      .spyOn(useCase, "execute")
      .mockResolvedValue({ ok: true, value: sampleValue() });
    const controller = new GetCostStatsController(useCase);
    const req = { userId: "user-1", params: { id: "repo-1" }, query: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(executeSpy).toHaveBeenCalledWith({ userId: "user-1", repoId: "repo-1", period: "30d" });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 when the repo isn't found (ownership)", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: false, error: "repo_not_found" });
    const controller = new GetCostStatsController(useCase);
    const req = { userId: "user-1", params: { id: "repo-1" }, query: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
