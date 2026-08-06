import { z } from "zod";

export const ingestWebhookSchema = z.object({
  action: z.string(),
  // Only present on the raw GitHub payload when action = "synchronize" — the
  // commit at the tip of the PR before this push. Used to reconcile
  // previously published suggestions against what changed in this push.
  before: z.string().min(1).optional(),
  pull_request: z.object({
    number: z.number().int().positive(),
    head: z.object({ sha: z.string().min(1) }),
    title: z.string(),
    body: z.string().nullable().optional(),
  }),
  repository: z.object({
    full_name: z.string().min(1),
  }),
});

export type IngestWebhookInput = z.infer<typeof ingestWebhookSchema>;
