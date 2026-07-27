import { z } from "zod";

export const updateRepoConfigSchema = z.object({
  model: z.string().min(1).optional(),
  tokenLimit: z.coerce.number().int().positive().optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  enabledCategories: z.array(z.string()).optional(),
});

export type UpdateRepoConfigInput = z.infer<typeof updateRepoConfigSchema>;
