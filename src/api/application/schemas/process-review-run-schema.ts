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

export const processReviewRunSchema = z.object({
  diff: z.object({
    files: z.array(diffFileSchema),
  }),
  prTitle: z.string().optional(),
  prDescription: z.string().optional(),
});

export type ProcessReviewRunInput = z.infer<typeof processReviewRunSchema>;
