import { z } from "zod";

import { REVIEW_LANGUAGES } from "../../domain/entities/repo-config.entity";

export const updateRepoConfigSchema = z.object({
  model: z.string().min(1).optional(),
  tokenLimit: z.coerce.number().int().positive().optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  enabledCategories: z.array(z.string()).optional(),
  promptId: z.string().uuid().nullable().optional(),
  reviewLanguage: z.enum(REVIEW_LANGUAGES).optional(),
});

export type UpdateRepoConfigInput = z.infer<typeof updateRepoConfigSchema>;
