import { z } from "zod";

export const ingestCommentReplyWebhookSchema = z.object({
  action: z.literal("created"), // "edited"/"deleted" never reach the use case
  comment: z.object({
    id: z.number().int().positive(),
    // Only present when the comment IS a reply within a thread — always
    // points at the FIRST comment of the thread (the root), never the
    // immediately-preceding reply, even in a thread with multiple replies.
    in_reply_to_id: z.number().int().positive().optional(),
    body: z.string().min(1),
    user: z.object({ login: z.string() }),
  }),
  pull_request: z.object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string().nullable(),
    head: z.object({ sha: z.string().min(1) }),
  }),
  repository: z.object({ full_name: z.string().min(1) }),
});

export type IngestCommentReplyWebhookInput = z.infer<typeof ingestCommentReplyWebhookSchema>;
