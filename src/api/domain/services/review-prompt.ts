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
    'Respond with ONLY a JSON object matching this exact shape, no markdown code fences, no text before or after it: {"comments": [{"file": string, "line": number, "category": string, "severity": "low" | "medium" | "high" | "critical", "body": string, "kind": "actionable" | "observation", "suggestedCode": string | null}], "overview": string | null}',
    "If there is nothing worth commenting on, respond with an empty comments array — do not invent issues to have something to say, and do not add a comment that only praises the code instead of flagging a real problem.",
    'Classify every comment\'s "kind" as "actionable" only when the fix is local and mechanical enough to be expressed as an unambiguous replacement code block (the same line, or a small contiguous block) — set "suggestedCode" to exactly that replacement text, with no line numbers and no markdown fences, just the code. Otherwise (a design decision, an architectural tradeoff, a pattern spread across multiple files, a question or observation with no single "answer" in code) classify it as "observation" and set "suggestedCode" to null. "suggestedCode" must be a non-blank string (not just whitespace) when kind is "actionable", and must be null when kind is "observation" — never mix the two.',
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
