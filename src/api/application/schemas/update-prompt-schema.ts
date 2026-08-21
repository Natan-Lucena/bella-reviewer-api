import { z } from "zod";

export const updatePromptSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(40000).optional(),
});

export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;
