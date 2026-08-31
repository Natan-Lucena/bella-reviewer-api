import type { ReviewLanguage } from "../entities/repo-config.entity";
import type { GenerationPrompt } from "../ports/llm-provider.port";
import { LANGUAGE_NAMES } from "./review-prompt";

export type CommentReplyContext = {
  prTitle: string;
  prDescription: string | null;
  customInstructions: string | undefined;
  // The other comments already published in this same ReviewRun (excluding
  // the one this thread is about) — gives the model situational awareness
  // of the rest of the review, for replies that reference or compare to
  // another finding. Condensed, no suggestedCode.
  otherComments: { file: string; line: number; category: string; severity: string; body: string }[];
  file: string;
  originalCategory: string;
  originalSeverity: string;
  originalBody: string;
  originalSuggestedCode: string | null;
  contextBefore: string | null;
  contextAfter: string | null;
  // This thread's conversation so far (can be empty — first reply), chronological.
  priorExchanges: { humanBody: string; bellaBody: string }[];
  humanBody: string;
  reviewLanguage: ReviewLanguage;
  temperature: number;
};

function buildSystemInstruction(context: CommentReplyContext): string {
  return [
    "You are continuing a code review conversation. You already left a comment on a specific piece of code; the PR author or a collaborator replied to it. Respond helpfully and specifically to what they actually asked — don't just restate your original comment.",
    "You have access to the PR's title/description, any custom review guidance configured for this repo, and the other comments you already left elsewhere in this same review — use them for context (e.g. a comparison to another finding), but this is still a reply to ONE specific thread: don't restate unrelated findings or start reviewing other files.",
    context.customInstructions
      ? `Repo-specific review guidance to follow:\n${context.customInstructions}`
      : "",
    "If they're asking for a code fix (e.g. \"turn this into a for loop\", \"why not use X instead\"), and you can express it as a clean, mechanical replacement of the exact original code range, propose one via \"suggestedCode\". If the fix would require touching a different range, a different file, or isn't expressible as a mechanical replacement, explain in \"body\" instead and leave \"suggestedCode\" null.",
    `Write "body" in ${LANGUAGE_NAMES[context.reviewLanguage]}.`,
    'Classify the human message into exactly one "category": "fix" when they are explicitly asking you to correct, change, or improve the code (regardless of whether you end up able to produce a mechanical "suggestedCode" for it); "clarification" when they are asking you to explain or justify the finding, without disputing it or asking for a code change; "disagreement" when they are pushing back on the finding itself — saying it doesn\'t apply, isn\'t a real problem, or is wrong; "acknowledgment" when they are just confirming or thanking you, with no real question or pushback; "other" for anything that fits none of the above.',
    'Respond with ONLY a JSON object matching this exact shape, no markdown code fences, no text before or after it: {"body": string, "suggestedCode": string | null, "category": "fix" | "clarification" | "disagreement" | "acknowledgment" | "other"}',
    '"suggestedCode", when set, must be the complete replacement for the exact same line range as your original comment — you cannot re-target a different range or file in a reply. Never mix: a non-null "suggestedCode" pairs with a "body" that introduces it, not a code fix described only in prose.',
  ]
    .filter((part) => part !== "")
    .join("\n\n");
}

function buildUserContent(context: CommentReplyContext): string {
  const parts = [
    `PR title: ${context.prTitle}`,
    ...(context.prDescription ? [`PR description:\n${context.prDescription}`] : []),
    `File: ${context.file}`,
    `Your original comment (${context.originalCategory}, ${context.originalSeverity}):\n${context.originalBody}`,
  ];
  if (context.originalSuggestedCode) {
    parts.push(`Your original suggested code:\n${context.originalSuggestedCode}`);
  }
  if (context.contextBefore || context.contextAfter) {
    parts.push(
      `Surrounding code:\n${context.contextBefore ?? ""}\n[the commented line(s)]\n${context.contextAfter ?? ""}`,
    );
  }
  if (context.otherComments.length > 0) {
    const summary = context.otherComments
      .map((c) => `- ${c.file}:${c.line} (${c.category}, ${c.severity}): ${c.body}`)
      .join("\n");
    parts.push(`Other comments you left elsewhere in this same review, for context only:\n${summary}`);
  }
  for (const exchange of context.priorExchanges) {
    parts.push(`Human: ${exchange.humanBody}\nYou: ${exchange.bellaBody}`);
  }
  parts.push(`Human: ${context.humanBody}`);
  return parts.join("\n\n");
}

export function buildCommentReplyPrompt(context: CommentReplyContext): GenerationPrompt {
  return {
    systemInstruction: buildSystemInstruction(context),
    userContent: buildUserContent(context),
    temperature: context.temperature,
  };
}
