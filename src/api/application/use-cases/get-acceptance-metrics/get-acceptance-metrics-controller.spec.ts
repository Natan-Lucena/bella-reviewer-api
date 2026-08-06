import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { CommentRepository } from "../../../domain/repository/comment.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { GetAcceptanceMetricsController } from "./get-acceptance-metrics-controller";
import { GetAcceptanceMetricsUseCase } from "./get-acceptance-metrics-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeUseCase(): GetAcceptanceMetricsUseCase {
  return new GetAcceptanceMetricsUseCase(
    mock<RepoRepository>(),
    mock<CommentRepository>(),
    mock<ReviewRunRepository>(),
  );
}

function sampleValue() {
  return {
    applyRate: { value: 50, decidedCount: 2, appliedCount: 1 },
    applyRateByCategory: [],
    applyRateBySeverity: [],
    coverage: { actionableCount: 2, observationCount: 0, actionableShare: 100 },
    costPerAppliedSuggestion: 3,
    previousPeriod: { applyRate: { value: null }, costPerAppliedSuggestion: null },
  };
}

describe("GetAcceptanceMetricsController", () => {
  it("returns 400 for an invalid period", async () => {
    const controller = new GetAcceptanceMetricsController(makeUseCase());
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
    const controller = new GetAcceptanceMetricsController(useCase);
    const req = { userId: "user-1", params: { id: "repo-1" }, query: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(executeSpy).toHaveBeenCalledWith({ userId: "user-1", repoId: "repo-1", period: "30d" });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 when the repo isn't found (ownership)", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: false, error: "repo_not_found" });
    const controller = new GetAcceptanceMetricsController(useCase);
    const req = { userId: "user-1", params: { id: "repo-1" }, query: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
