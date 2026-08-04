import { z } from "zod";

export const listGithubReposSchema = z.object({
  pat: z.string().min(1, "pat is required"),
});

export type ListGithubReposInput = z.infer<typeof listGithubReposSchema>;
