import { z } from "zod";

export const createPromptSchema = z.object({
  name: z.string().min(1).max(100),
  // Cap arbitrary but informed: the entire built-in guidance (8 sections)
  // totals ~34k characters, and real-world custom prompts (a full external
  // skill doc pasted in, e.g. a security-review checklist with reference
  // tables) land in that same range — 40000 gives room for those without
  // being unbounded.
  content: z.string().min(1).max(40000),
});

export type CreatePromptInput = z.infer<typeof createPromptSchema>;
