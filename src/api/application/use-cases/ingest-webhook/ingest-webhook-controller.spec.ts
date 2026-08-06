import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { QueuePort } from "../../../domain/ports/queue.port";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { FinalizeSuggestionReconciliationUseCase } from "../finalize-suggestion-reconciliation/finalize-suggestion-reconciliation-use-case";
import { ReconcileSuggestionApplicationsUseCase } from "../reconcile-suggestion-applications/reconcile-suggestion-applications-use-case";
import { IngestWebhookController } from "./ingest-webhook-controller";
import { IngestWebhookUseCase } from "./ingest-webhook-use-case";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      action: "opened",
      pull_request: {
        number: 42,
        head: { sha: "abc123" },
        title: "Fix bug",
        body: "Details.",
      },
      repository: { full_name: "org/repo" },
      ...overrides,
    }),
  );
}

function makeUseCase(): IngestWebhookUseCase {
  return new IngestWebhookUseCase(
    mock<ReviewRunRepository>(),
    mock<RepoRepository>(),
    mock<CredentialRepository>(),
    mock<QueuePort>(),
    mock<ReconcileSuggestionApplicationsUseCase>(),
  );
}

function makeFinalizeMock(): FinalizeSuggestionReconciliationUseCase {
  const finalizeUseCase = mock<FinalizeSuggestionReconciliationUseCase>();
  finalizeUseCase.execute.mockResolvedValue({ ok: true, value: undefined });
  return finalizeUseCase;
}

function makeController(
  useCase: IngestWebhookUseCase = makeUseCase(),
  finalizeUseCase: FinalizeSuggestionReconciliationUseCase = makeFinalizeMock(),
): IngestWebhookController {
  return new IngestWebhookController(useCase, finalizeUseCase);
}

describe("IngestWebhookController", () => {
  it("returns 400 when the body isn't valid JSON", async () => {
    const controller = makeController();
    const req = { body: Buffer.from("not json"), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "invalid_payload" }) }),
    );
  });

  it("returns 400 when the payload fails schema validation", async () => {
    const controller = makeController();
    const req = { body: Buffer.from(JSON.stringify({})), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "validation_error" }) }),
    );
  });

  it("returns 400 for a payload shaped like a different GitHub event (no pull_request key) — this controller only ever handles pull_request bodies, dispatch by X-GitHub-Event happens in the router", async () => {
    const controller = makeController();
    const reviewThreadShapedPayload = Buffer.from(
      JSON.stringify({
        action: "resolved",
        thread: { comments: [] },
        repository: { full_name: "org/repo" },
      }),
    );
    const req = { body: reviewThreadShapedPayload, repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "validation_error" }) }),
    );
  });

  it("returns 200 with { ignored: true } when the use case reports an ignored action", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({ ok: true, value: { kind: "ignored" } });
    const controller = makeController(useCase);
    const req = {
      body: validPayload({ action: "labeled" }),
      repoId: "repo-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ignored: true });
  });

  it("returns 202 for a newly accepted run", async () => {
    const useCase = makeUseCase();
    const executeSpy = vi.spyOn(useCase, "execute").mockResolvedValue({
      ok: true,
      value: {
        kind: "accepted",
        isNew: true,
        reviewRun: { id: { value: "run-1" }, status: "queued", commitSha: "abc123" },
      },
    });
    const controller = makeController(useCase);
    const req = { body: validPayload(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(executeSpy).toHaveBeenCalledWith({
      repoId: "repo-1",
      action: "opened",
      prNumber: 42,
      commitSha: "abc123",
      prTitle: "Fix bug",
      prDescription: "Details.",
    });
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("passes the payload's before field through as previousCommitSha", async () => {
    const useCase = makeUseCase();
    const executeSpy = vi.spyOn(useCase, "execute").mockResolvedValue({
      ok: true,
      value: {
        kind: "accepted",
        isNew: true,
        reviewRun: { id: { value: "run-1" }, status: "queued", commitSha: "new-sha" },
      },
    });
    const controller = makeController(useCase);
    const req = {
      body: validPayload({ action: "synchronize", before: "old-sha" }),
      repoId: "repo-1",
    } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: "synchronize", previousCommitSha: "old-sha" }),
    );
  });

  it("returns 200 (not 202) for an already-ingested commit", async () => {
    const useCase = makeUseCase();
    vi.spyOn(useCase, "execute").mockResolvedValue({
      ok: true,
      value: {
        kind: "accepted",
        isNew: false,
        reviewRun: { id: { value: "run-1" }, status: "processing", commitSha: "abc123" },
      },
    });
    const controller = makeController(useCase);
    const req = { body: validPayload(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  describe("closed action", () => {
    function closedPayload(overrides: Record<string, unknown> = {}) {
      return Buffer.from(
        JSON.stringify({
          action: "closed",
          pull_request: { number: 42, head: { sha: "final-sha" } },
          repository: { full_name: "org/repo" },
          ...overrides,
        }),
      );
    }

    it("finalizes reconciliation instead of calling IngestWebhookUseCase", async () => {
      const useCase = makeUseCase();
      const executeSpy = vi.spyOn(useCase, "execute");
      const finalizeUseCase = makeFinalizeMock();
      const controller = makeController(useCase, finalizeUseCase);
      const req = { body: closedPayload(), repoId: "repo-1" } as unknown as Request;
      const res = createMockResponse();

      await controller.execute(req, res);

      expect(finalizeUseCase.execute).toHaveBeenCalledWith({
        repoId: "repo-1",
        prNumber: 42,
        finalCommitSha: "final-sha",
      });
      expect(executeSpy).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ finalized: true });
    });

    it("returns 400 when the closed payload fails schema validation", async () => {
      const controller = makeController();
      const req = {
        body: Buffer.from(
          JSON.stringify({ action: "closed", repository: { full_name: "org/repo" } }),
        ),
        repoId: "repo-1",
      } as unknown as Request;
      const res = createMockResponse();

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("still returns 200 when finalization rejects — best-effort", async () => {
      const finalizeUseCase = makeFinalizeMock();
      finalizeUseCase.execute.mockRejectedValue(new Error("db error"));
      const controller = makeController(makeUseCase(), finalizeUseCase);
      const req = { body: closedPayload(), repoId: "repo-1" } as unknown as Request;
      const res = createMockResponse();

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ finalized: true });
    });

    it("still returns 200 when finalization resolves with a business failure", async () => {
      const finalizeUseCase = makeFinalizeMock();
      finalizeUseCase.execute.mockResolvedValue({ ok: false, error: "repo_not_found" });
      const controller = makeController(makeUseCase(), finalizeUseCase);
      const req = { body: closedPayload(), repoId: "repo-1" } as unknown as Request;
      const res = createMockResponse();

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
