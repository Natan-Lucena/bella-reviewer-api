import { z } from "zod";

export const listCommentsSchema = z.object({
  prNumber: z.coerce.number().int().positive().optional(),
  category: z.string().min(1).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["generated", "published", "discarded", "outdated"]).optional(),
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListCommentsInput = z.infer<typeof listCommentsSchema>;
