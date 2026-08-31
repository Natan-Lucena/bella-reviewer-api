import { z } from "zod";

export const getCostStatsSchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export type GetCostStatsInput = z.infer<typeof getCostStatsSchema>;
