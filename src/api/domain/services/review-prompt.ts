import type { GenerationPrompt } from "../ports/llm-provider.port";
import type { Diff } from "../ports/scm-adapter.port";
import { buildReviewGuidance } from "./review-guidance";
import type { ReviewContext } from "./review-service";

// Reconstructs a human/LLM-readable diff from the structured Diff type —
// the inverse of parseUnifiedDiffPatch (integration/github/). Kept separate
// from prompt assembly so both are independently testable.
export function serializeDiffForPrompt(diff: Diff): string {
  return diff.files
    .map((file) => {
      const hunks = file.hunks
        .map((hunk) => {
          const lines = hunk.lines
            .map((line) => {
              const marker = line.status === "added" ? "+" : line.status === "removed" ? "-" : " ";
              return `${marker}${line.content}`;
            })
            .join("\n");
          return `@@ -${hunk.oldStartLine} +${hunk.newStartLine} @@\n${lines}`;
        })
        .join("\n");
      return `--- ${file.path}\n${hunks}`;
    })
    .join("\n\n");
}

function buildSystemInstruction(context: ReviewContext): string {
  const categoriesLine =
    context.enabledCategories.length > 0
      ? `Focus only on these categories: ${context.enabledCategories.join(", ")}.`
      : "Consider all relevant categories (e.g. bug, security, performance, readability, style).";

  return [
    "You are an expert code reviewer analyzing a complete pull request.",
    "You are given every changed file in this PR together, not one at a time — use that to reason across files: a signature change in one file that breaks a caller in another, a helper introduced in one file and misused in another, an inconsistency between two files that only shows up when compared side by side. This cross-file reasoning is the main value you provide over reviewing files in isolation.",
    categoriesLine,
    "Only comment on lines that are part of the diff (added or unchanged context lines) — never on removed lines, since there is nowhere to attach that comment in the new file.",
    "The following is your detailed reviewing guidance. It applies across programming languages — use whichever sections are relevant to the diff you are given, and ignore any that don't apply.",
    buildReviewGuidance(),
    'Respond with ONLY a JSON object matching this exact shape, no markdown code fences, no text before or after it: {"comments": [{"file": string, "line": number, "endLine": number, "category": string, "severity": "low" | "medium" | "high" | "critical", "body": string, "kind": "actionable" | "observation", "suggestedCode": string | null}], "overview": string | null}',
    "If there is nothing worth commenting on, respond with an empty comments array — do not invent issues to have something to say, and do not add a comment that only praises the code instead of flagging a real problem.",
    '"line" is the first line your comment targets and "endLine" is the last — set "endLine" equal to "line" for a single-line comment.',
    'Classify every comment\'s "kind" as "actionable" only when the fix is a clean, mechanical replacement of lines "line" through "endLine" (inclusive) — set "suggestedCode" to the complete replacement text for that whole range, with no line numbers and no markdown fences. "suggestedCode" does NOT need the same number of lines as the range: collapsing a multi-line block into a shorter (even one-line) replacement is normal and expected, as is expanding a single line into several — GitHub replaces the entire declared range with whatever "suggestedCode" contains, regardless of line count on either side. Keep the range itself as small as possible — include only the lines that actually need to change, never pad it with unchanged context, and never span more than 30 lines. If the fix cannot be expressed as a clean replacement of one contiguous line range (it requires edits in multiple, non-adjacent places, spans more than 30 lines, or touches a different file), classify it as "observation" instead. Also classify as "observation" anything that isn\'t a mechanical code fix at all (a design decision, an architectural tradeoff, a pattern spread across multiple files, a question with no single "answer" in code) — for "observation", set "suggestedCode" to null and "endLine" equal to "line". "suggestedCode" must be a non-blank string when kind is "actionable", and must be null when kind is "observation" — never mix the two.',
    'When comments is empty, you may optionally set "overview" to a short paragraph (2-4 sentences) on real, specific points of attention for the change as a whole — positive or negative, e.g. a notable design decision, a coverage gap, a tradeoff worth flagging. Never use it for generic praise like "looks good" with nothing behind it — if you have nothing specific to say even at that level, leave it null. Never set "overview" when comments is non-empty; leave it null in that case.',
  ].join("\n\n");
}

function buildUserContent(diff: Diff, context: ReviewContext): string {
  const parts: string[] = [];
  if (context.prTitle) {
    parts.push(`PR title: ${context.prTitle}`);
  }
  if (context.prDescription) {
    parts.push(`PR description:\n${context.prDescription}`);
  }
  parts.push(`Diff (all files in this PR):\n${serializeDiffForPrompt(diff)}`);
  return parts.join("\n\n");
}

// The single prompt sent for the whole PR — see review-service.ts for why
// this is one call instead of one per file.
export function buildReviewPrompt(diff: Diff, context: ReviewContext): GenerationPrompt {
  return {
    systemInstruction: buildSystemInstruction(context),
    userContent: buildUserContent(diff, context),
    temperature: context.temperature,
  };
}
