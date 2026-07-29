// Wraps the model's own overview text (see review-prompt.ts and
// mindset-and-feedback.ts, "When you find nothing to flag") with a small
// identifying header before it's published as a general PR comment — so it
// reads as Bella's summary, not an unattributed drive-by comment. Published
// only when a run's diff produced zero per-line comments (see
// process-review-run-use-case.ts).
export function buildOverviewComment(overview: string): string {
  return ["🔎 **Bella — visão geral desta revisão**", "", overview].join("\n");
}
