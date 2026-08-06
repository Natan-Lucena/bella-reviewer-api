import { z } from "zod";

export const prClosedWebhookSchema = z.object({
  action: z.literal("closed"),
  pull_request: z.object({
    number: z.number().int().positive(),
    head: z.object({ sha: z.string().min(1) }),
  }),
  repository: z.object({
    full_name: z.string().min(1),
  }),
});

export type PrClosedWebhookInput = z.infer<typeof prClosedWebhookSchema>;
