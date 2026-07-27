import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Diff } from "../../../domain/ports/scm-adapter.port";
import { QueuePort } from "../../../domain/ports/queue.port";
import { ReviewRun } from "../../../domain/entities/review-run.entity";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";
import { IngestActionUseCase } from "./ingest-action-use-case";

const emptyDiff: Diff = { files: [] };

describe("IngestActionUseCase", () => {
  it("creates a new ReviewRun and publishes it to the queue when the commit hasn't been seen", async () => {
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(null);
    const queue = mock<QueuePort>();
    const useCase = new IngestActionUseCase(reviewRunRepository, queue);

    const result = await useCase.execute({
      repoId: "repo-1",
      prNumber: 42,
      commitSha: "abc123",
      diff: emptyDiff,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isNew).toBe(true);
    expect(result.value.reviewRun.status).toBe("queued");
    expect(result.value.reviewRun.trigger).toBe("action");
    expect(reviewRunRepository.save).toHaveBeenCalledWith(result.value.reviewRun);

    expect(queue.publish).toHaveBeenCalledTimes(1);
    const publishCall = queue.publish.mock.calls[0][0];
    expect(publishCall.url).toContain(
      `/internal/review-runs/${result.value.reviewRun.id.value}/process`,
    );
    expect(publishCall.body).toEqual({ diff: emptyDiff });
  });

  it("returns the existing ReviewRun without creating a new one or re-publishing (idempotency)", async () => {
    const existing = ReviewRun.create({
      repoId: "repo-1",
      prNumber: 42,
      commitSha: "abc123",
      trigger: "action",
    });
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.findByRepoIdAndCommitSha.mockResolvedValue(existing);
    const queue = mock<QueuePort>();
    const useCase = new IngestActionUseCase(reviewRunRepository, queue);

    const result = await useCase.execute({
      repoId: "repo-1",
      prNumber: 42,
      commitSha: "abc123",
      diff: emptyDiff,
    });

    expect(result).toEqual({ ok: true, value: { reviewRun: existing, isNew: false } });
    expect(reviewRunRepository.save).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });
});
