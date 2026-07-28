import { z } from "zod";

const diffLineSchema = z.object({
  content: z.string(),
  status: z.enum(["added", "removed", "unchanged"]),
  lineNumber: z.number().int(),
});

const diffHunkSchema = z.object({
  oldStartLine: z.number().int(),
  newStartLine: z.number().int(),
  lines: z.array(diffLineSchema),
});

const diffFileSchema = z.object({
  path: z.string(),
  hunks: z.array(diffHunkSchema),
});

export const ingestActionSchema = z.object({
  prNumber: z.coerce.number().int().positive(),
  commitSha: z.string().min(1),
  // Accepted for a future display use case — there's nowhere to persist it
  // yet (ReviewRun has no author column), so it isn't threaded any further.
  author: z.string().optional(),
  // Fed into the review core's single prompt as part of the PR's context
  // (unlike author, these DO get threaded through — see ingest-action-use-case.ts).
  prTitle: z.string().optional(),
  prDescription: z.string().optional(),
  diff: z.object({
    files: z.array(diffFileSchema),
  }),
});

export type IngestActionInput = z.infer<typeof ingestActionSchema>;
