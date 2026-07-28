import { failure, Result, success } from "../../../../shared/core/result";
import { assertRepoOwnership } from "../../../domain/services/assert-repo-ownership";
import {
  DashboardPeriod,
  getPeriodRange,
  percentageChange,
} from "../../../domain/services/dashboard-period";
import {
  getServiceState,
  isConfigComplete,
  ServiceState,
} from "../../../domain/services/repo-config-completeness";
import { CredentialRepository } from "../../../domain/repository/credential.repository";
import { RepoConfigRepository } from "../../../domain/repository/repo-config.repository";
import { RepoRepository } from "../../../domain/repository/repo.repository";
import { ReviewRunRepository } from "../../../domain/repository/review-run.repository";

export type GetRepoDashboardParams = {
  userId: string;
  repoId: string;
  period: DashboardPeriod;
};

export type GetRepoDashboardError = "repo_not_found";

export type GetRepoDashboardResult = {
  period: DashboardPeriod;
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    estimatedCost: number;
    percentageChangeFromPreviousPeriod: number | null;
  };
  activeLlmProvider: string;
  activeModel: string;
  serviceState: ServiceState;
};

export class GetRepoDashboardUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly repoConfigRepository: RepoConfigRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly reviewRunRepository: ReviewRunRepository,
  ) {}

  async execute(
    params: GetRepoDashboardParams,
  ): Promise<Result<GetRepoDashboardResult, GetRepoDashboardError>> {
    const repo = await assertRepoOwnership(this.repoRepository, params.repoId, params.userId);
    if (!repo) {
      return failure("repo_not_found");
    }

    const [config, credentials] = await Promise.all([
      this.repoConfigRepository.findByRepoId(params.repoId),
      this.credentialRepository.findAllByRepoId(params.repoId),
    ]);

    const range = getPeriodRange(params.period, new Date());
    const [current, previous] = await Promise.all([
      this.reviewRunRepository.sumUsageByRepoIdAndDateRange(
        params.repoId,
        range.currentFrom,
        range.currentTo,
      ),
      this.reviewRunRepository.sumUsageByRepoIdAndDateRange(
        params.repoId,
        range.previousFrom,
        range.previousTo,
      ),
    ]);

    // Percentage change is computed on total token volume — the single
    // number that best represents "usage" across input/output/reasoning.
    const currentTotal = current.inputTokens + current.outputTokens + current.reasoningTokens;
    const previousTotal = previous.inputTokens + previous.outputTokens + previous.reasoningTokens;

    return success({
      period: params.period,
      usage: {
        inputTokens: current.inputTokens,
        outputTokens: current.outputTokens,
        reasoningTokens: current.reasoningTokens,
        estimatedCost: current.estimatedCost,
        percentageChangeFromPreviousPeriod: percentageChange(currentTotal, previousTotal),
      },
      // A Repo always gets a RepoConfig at creation time — this fallback
      // only guards against a data-consistency bug.
      activeLlmProvider: config?.llmProvider ?? "gemini",
      activeModel: config?.model ?? "",
      serviceState: getServiceState(repo.active, isConfigComplete(credentials)),
    });
  }
}
