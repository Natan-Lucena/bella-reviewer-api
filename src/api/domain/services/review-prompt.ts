import type { GenerationPrompt } from "../ports/llm-provider.port";
import type { Diff } from "../ports/scm-adapter.port";
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
    'Respond with ONLY a JSON object matching this exact shape, no markdown code fences, no text before or after it: {"comments": [{"file": string, "line": number, "category": string, "severity": "low" | "medium" | "high" | "critical", "body": string}]}',
    "If there is nothing worth commenting on, respond with an empty comments array — do not invent issues to have something to say.",
  ].join("\n");
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
