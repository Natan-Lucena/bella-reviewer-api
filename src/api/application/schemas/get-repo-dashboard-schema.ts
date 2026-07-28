import { z } from "zod";

export const getRepoDashboardSchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export type GetRepoDashboardInput = z.infer<typeof getRepoDashboardSchema>;
