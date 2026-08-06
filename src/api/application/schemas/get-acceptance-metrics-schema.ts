import { z } from "zod";

export const getAcceptanceMetricsSchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export type GetAcceptanceMetricsInput = z.infer<typeof getAcceptanceMetricsSchema>;
