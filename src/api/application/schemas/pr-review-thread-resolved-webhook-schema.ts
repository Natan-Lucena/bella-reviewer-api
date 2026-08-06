import { z } from "zod";

// Field names here follow GitHub's documented pull_request_review_thread
// event shape as of this writing — not yet verified against a real payload
// (no test webhook has been configured for this event type yet). Re-check
// against a real delivery before relying on this in production; thread
// resolution silently no-ops (see reconcile-thread-resolution-use-case.ts)
// rather than erroring, so a wrong field name here would fail quietly, not
// loudly.
export const prReviewThreadResolvedWebhookSchema = z.object({
  action: z.literal("resolved"),
  thread: z.object({
    // The first comment in the thread is the original review comment (the
    // one publishComment posted) — later entries are replies, not the
    // suggestion itself.
    comments: z.array(z.object({ id: z.number().int().positive() })).min(1),
  }),
  pull_request: z.object({
    number: z.number().int().positive(),
    head: z.object({ sha: z.string().min(1) }),
  }),
  repository: z.object({
    full_name: z.string().min(1),
  }),
});

export type PrReviewThreadResolvedWebhookInput = z.infer<
  typeof prReviewThreadResolvedWebhookSchema
>;
