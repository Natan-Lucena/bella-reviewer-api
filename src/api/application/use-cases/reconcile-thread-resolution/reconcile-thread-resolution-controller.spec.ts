import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { ReconcileThreadResolutionController } from "./reconcile-thread-resolution-controller";
import { ReconcileThreadResolutionUseCase } from "./reconcile-thread-resolution-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function resolvedPayload(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      action: "resolved",
      thread: { comments: [{ id: 999 }] },
      pull_request: { number: 42, head: { sha: "head-sha" } },
      repository: { full_name: "org/repo" },
      ...overrides,
    }),
  );
}

function makeUseCase(): ReconcileThreadResolutionUseCase {
  const useCase = mock<ReconcileThreadResolutionUseCase>();
  useCase.execute.mockResolvedValue({ ok: true, value: undefined });
  return useCase;
}

describe("ReconcileThreadResolutionController", () => {
  it("returns 400 when the body isn't valid JSON", async () => {
    const controller = new ReconcileThreadResolutionController(makeUseCase());
    const req = { body: Buffer.from("not json"), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "invalid_payload" }) }),
    );
  });

  it("returns 200 with { ignored: true } for an action other than resolved, without calling the use case", async () => {
    const useCase = makeUseCase();
    const controller = new ReconcileThreadResolutionController(useCase);
    const req = {
      body: resolvedPayload({ action: "unresolved" }),
      repoId: "repo-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ignored: true });
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it("returns 400 when a resolved payload fails schema validation", async () => {
    const controller = new ReconcileThreadResolutionController(makeUseCase());
    const req = {
      body: Buffer.from(
        JSON.stringify({ action: "resolved", repository: { full_name: "org/repo" } }),
      ),
      repoId: "repo-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("calls the use case with the first thread comment's id as externalId", async () => {
    const useCase = makeUseCase();
    const controller = new ReconcileThreadResolutionController(useCase);
    const req = { body: resolvedPayload(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(useCase.execute).toHaveBeenCalledWith({
      repoId: "repo-1",
      externalId: "999",
      headCommitSha: "head-sha",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ handled: true });
  });

  it("still returns 200 when the use case rejects — best-effort", async () => {
    const useCase = makeUseCase();
    useCase.execute.mockRejectedValue(new Error("GitHub transient error"));
    const controller = new ReconcileThreadResolutionController(useCase);
    const req = { body: resolvedPayload(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ handled: true });
  });

  it("still returns 200 when the use case resolves with a business failure", async () => {
    const useCase = makeUseCase();
    useCase.execute.mockResolvedValue({ ok: false, error: "repo_not_found" });
    const controller = new ReconcileThreadResolutionController(useCase);
    const req = { body: resolvedPayload(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
