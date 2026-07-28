import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { GetRepoDashboardController } from "./get-repo-dashboard-controller";
import { GetRepoDashboardUseCase } from "./get-repo-dashboard-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeUseCase(): GetRepoDashboardUseCase {
  return new GetRepoDashboardUseCase(
    mock<RepoRepository>(),
    mock<RepoConfigRepository>(),
    mock<CredentialRepository>(),
    mock<ReviewRunRepository>(),
  );
}

describe("GetRepoDashboardController", () => {
  it("returns 400 for an invalid period", async () => {
    const controller = new GetRepoDashboardController(makeUseCase());
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
    const executeSpy = vi.spyOn(useCase, "execute").mockResolvedValue({
      ok: true,
      value: {
        period: "30d",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          estimatedCost: 0,
          percentageChangeFromPreviousPeriod: null,
        },
        activeLlmProvider: "gemini",
        activeModel: "gemini-2.5-flash",
        serviceState: "active",
      },
    });
    const controller = new GetRepoDashboardController(useCase);
    const req = { userId: "user-1", params: { id: "repo-1" }, query: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(executeSpy).toHaveBeenCalledWith({ userId: "user-1", repoId: "repo-1", period: "30d" });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 when the repo isn't found", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: false, error: "repo_not_found" });
    const controller = new GetRepoDashboardController(useCase);
    const req = { userId: "user-1", params: { id: "repo-1" }, query: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
