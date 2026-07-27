import { ReviewTurn } from "../entities/review-turn.entity";

export interface ReviewTurnRepository {
  save(turn: ReviewTurn): Promise<void>;
  findByReviewRunId(reviewRunId: string): Promise<ReviewTurn[]>;
}
