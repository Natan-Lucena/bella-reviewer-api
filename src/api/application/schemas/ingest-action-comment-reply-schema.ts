import { z } from "zod";

export const ingestActionCommentReplySchema = z.object({
  prNumber: z.number().int().positive(),
  commitSha: z.string().min(1),
  commentId: z.number().int().positive(),
  inReplyToId: z.number().int().positive(),
  humanBody: z.string().min(1),
  humanAuthor: z.string().optional(),
  prTitle: z.string(),
  prDescription: z.string().nullable(),
});

export type IngestActionCommentReplyInput = z.infer<typeof ingestActionCommentReplySchema>;
