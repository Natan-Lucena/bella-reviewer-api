import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { QueuePort } from "../../../domain/ports/queue.port";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
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
  );
}

describe("IngestWebhookController", () => {
  it("returns 400 when the body isn't valid JSON", async () => {
    const controller = new IngestWebhookController(makeUseCase());
    const req = { body: Buffer.from("not json"), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "invalid_payload" }) }),
    );
  });

  it("returns 400 when the payload fails schema validation", async () => {
    const controller = new IngestWebhookController(makeUseCase());
    const req = { body: Buffer.from(JSON.stringify({})), repoId: "repo-1" } as unknown as Request;
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
    const controller = new IngestWebhookController(useCase);
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
    const controller = new IngestWebhookController(useCase);
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
    const controller = new IngestWebhookController(useCase);
    const req = { body: validPayload(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
