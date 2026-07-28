import { z } from "zod";

export const listReviewRunsSchema = z.object({
  status: z.enum(["queued", "processing", "completed", "failed"]).optional(),
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListReviewRunsInput = z.infer<typeof listReviewRunsSchema>;
