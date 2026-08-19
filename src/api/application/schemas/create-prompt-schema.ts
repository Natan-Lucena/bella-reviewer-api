import { z } from "zod";

export const createPromptSchema = z.object({
  name: z.string().min(1).max(100),
  // Cap arbitrary but informed: the entire built-in guidance (8 sections)
  // totals ~34k characters — 8000 leaves generous room for style/focus
  // instructions without approaching the token cost of a custom prompt that
  // tried to rewrite the whole guidance from scratch.
  content: z.string().min(1).max(8000),
});

export type CreatePromptInput = z.infer<typeof createPromptSchema>;
