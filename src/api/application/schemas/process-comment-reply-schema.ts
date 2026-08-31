import { z } from "zod";

export const processCommentReplySchema = z.object({
  prNumber: z.number().int(),
  commitSha: z.string(),
  prTitle: z.string(),
  prDescription: z.string().nullable(),
});

export type ProcessCommentReplyInput = z.infer<typeof processCommentReplySchema>;
