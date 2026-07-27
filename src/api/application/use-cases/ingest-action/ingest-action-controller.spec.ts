import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";

import { QueuePort } from "../../../domain/ports/queue.port";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { IngestActionUseCase } from "./ingest-action-use-case";
import { IngestActionController } from "./ingest-action-controller";

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function validBody() {
  return {
    prNumber: 42,
    commitSha: "abc123",
    diff: { files: [] },
  };
}

describe("IngestActionController", () => {
  it("returns 400 when the body is missing required fields", async () => {
    const useCase = new IngestActionUseCase(mock<ReviewRunRepository>(), mock<QueuePort>());
    const controller = new IngestActionController(useCase);
    const req = { body: {}, repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "validation_error" }) }),
    );
  });

  it("returns 202 with the new run when the commit hasn't been seen", async () => {
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);
    const useCase = new IngestActionUseCase(reviewRunRepository, mock<QueuePort>());
    const controller = new IngestActionController(useCase);
    const req = { body: validBody(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    await controller.execute(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.status).toBe("queued");
    expect(body.commitSha).toBe("abc123");
  });

  it("returns 200 (not 202) when the same commit was already ingested", async () => {
    const reviewRunRepository = mock<ReviewRunRepository>();
    const useCase = new IngestActionUseCase(reviewRunRepository, mock<QueuePort>());
    const controller = new IngestActionController(useCase);
    const req = { body: validBody(), repoId: "repo-1" } as unknown as Request;
    const res = createMockResponse();

    // First call creates it.
    await controller.execute(req, res);
    // Make the second lookup see what the use case just "saved".
    const saved = reviewRunRepository.save.mock.calls[0][0];
    reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(saved);

    const res2 = createMockResponse();
    await controller.execute(req, res2);

    expect(res2.status).toHaveBeenCalledWith(200);
  });
});
