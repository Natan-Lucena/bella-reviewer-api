import { z } from "zod";

export const createRepoSchema = z.object({
  fullName: z
    .string()
    .regex(/^[^/\s]+\/[^/\s]+$/, "fullName must be in the format organization/repository"),
});

export type CreateRepoInput = z.infer<typeof createRepoSchema>;
