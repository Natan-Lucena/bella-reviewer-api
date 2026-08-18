import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";

import { Credential } from "../../../domain/entities/credential.entity";
import { Repo } from "../../../domain/entities/repo.entity";
import { RepoConfig } from "../../../domain/entities/repo-config.entity";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository, UsageSum } from "../../../domain/repository/review-run.repository";
import { GetRepoDashboardUseCase } from "./get-repo-dashboard-use-case";

function fullCredentials(repoId: string) {
  return [
    Credential.createLlm({ repoId, provider: "gemini", encryptedSecret: "x" }),
    Credential.createScm({ repoId, encryptedSecret: "x" }),
    Credential.createActionToken({ repoId, secretHash: "x" }),
    Credential.createWebhookSecret({ repoId, encryptedSecret: "x" }),
  ];
}

function usage(overrides: Partial<UsageSum> = {}): UsageSum {
  return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, estimatedCost: 0, ...overrides };
}

describe("GetRepoDashboardUseCase", () => {
  it("returns repo_not_found when the repo doesn't belong to the user", async () => {
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(null);
    const useCase = new GetRepoDashboardUseCase(
      repoRepository,
      mock<RepoConfigRepository>(),
      mock<CredentialRepository>(),
      mock<ReviewRunRepository>(),
    );

    const result = await useCase.execute({ userId: "user-1", repoId: "repo-1", period: "30d" });

    expect(result).toEqual({ ok: false, error: "repo_not_found" });
  });

  it("computes usage, percentage change, and serviceState for a fully configured active repo", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);

    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(
      RepoConfig.create({
        repoId: repo.id.value,
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
      }),
    );

    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findAllByRepoId.mockResolvedValue(fullCredentials(repo.id.value));

    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.sumUsageByRepoIdAndDateRange
      .mockResolvedValueOnce(usage({ inputTokens: 150, outputTokens: 50, estimatedCost: 0 })) // current
      .mockResolvedValueOnce(usage({ inputTokens: 100, outputTokens: 0 })); // previous

    const useCase = new GetRepoDashboardUseCase(
      repoRepository,
      repoConfigRepository,
      credentialRepository,
      reviewRunRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      period: "30d",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.usage.inputTokens).toBe(150);
    expect(result.value.usage.outputTokens).toBe(50);
    // Passed through unchanged from the repository — the real "always 0"
    // problem lives one layer down (ReviewRunRepositoryImpl/
    // ProcessReviewRunUseCase), not in this use case's own logic.
    expect(result.value.usage.estimatedCost).toBe(0);
    // current total 200 vs previous total 100 => +100%
    expect(result.value.usage.percentageChangeFromPreviousPeriod).toBe(100);
    expect(result.value.activeLlmProvider).toBe("gemini");
    expect(result.value.activeModel).toBe("gemini-2.5-flash");
    expect(result.value.serviceState).toBe("active");
  });

  it("returns configuration_pending when the repo is active but missing a credential", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(
      RepoConfig.create({
        repoId: repo.id.value,
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
      }),
    );
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findAllByRepoId.mockResolvedValue([
      Credential.createLlm({ repoId: repo.id.value, provider: "gemini", encryptedSecret: "x" }),
    ]);
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.sumUsageByRepoIdAndDateRange.mockResolvedValue(usage());

    const useCase = new GetRepoDashboardUseCase(
      repoRepository,
      repoConfigRepository,
      credentialRepository,
      reviewRunRepository,
    );

    const result = await useCase.execute({ userId: "user-1", repoId: repo.id.value, period: "7d" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.serviceState).toBe("configuration_pending");
  });

  it("returns null percentageChange when the previous period has no usage to compare against", async () => {
    const repo = Repo.create({ userId: "user-1", fullName: "org/repo" });
    const repoRepository = mock<RepoRepository>();
    repoRepository.findById.mockResolvedValue(repo);
    const repoConfigRepository = mock<RepoConfigRepository>();
    repoConfigRepository.findByRepoId.mockResolvedValue(
      RepoConfig.create({
        repoId: repo.id.value,
        llmProvider: "gemini",
        model: "gemini-2.5-flash",
        tokenLimit: 100000,
      }),
    );
    const credentialRepository = mock<CredentialRepository>();
    credentialRepository.findAllByRepoId.mockResolvedValue(fullCredentials(repo.id.value));
    const reviewRunRepository = mock<ReviewRunRepository>();
    reviewRunRepository.sumUsageByRepoIdAndDateRange
      .mockResolvedValueOnce(usage({ inputTokens: 100 }))
      .mockResolvedValueOnce(usage());

    const useCase = new GetRepoDashboardUseCase(
      repoRepository,
      repoConfigRepository,
      credentialRepository,
      reviewRunRepository,
    );

    const result = await useCase.execute({
      userId: "user-1",
      repoId: repo.id.value,
      period: "90d",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.usage.percentageChangeFromPreviousPeriod).toBeNull();
  });
});
