import { ReviewRun, StatusReviewRun } from "../entities/review-run.entity";

export type FindReviewRunsFiltro = {
  status?: StatusReviewRun;
  limit?: number;
  offset?: number;
};

export interface ReviewRunRepository {
  save(reviewRun: ReviewRun): Promise<void>;
  findById(id: string): Promise<ReviewRun | null>;
  // Base da idempotência de ingestão (RF-GAT-04) — ver backend-prds/08 e 09.
  findByRepositorioIdECommitSha(
    repositorioId: string,
    commitSha: string,
  ): Promise<ReviewRun | null>;
  findByRepositorioId(
    repositorioId: string,
    filtro?: FindReviewRunsFiltro,
  ): Promise<{ execucoes: ReviewRun[]; total: number }>;
}
