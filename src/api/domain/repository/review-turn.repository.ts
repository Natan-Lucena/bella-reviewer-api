import { ReviewTurn } from "../entities/review-turn.entity";

export interface ReviewTurnRepository {
  save(turno: ReviewTurn): Promise<void>;
  findByReviewRunId(reviewRunId: string): Promise<ReviewTurn[]>;
}
