import type { ReviewComment } from "./review-service";

const SEVERITIES = new Set(["low", "medium", "high", "critical"]);

function isValidCommentShape(value: unknown): value is {
  file: string;
  line: number;
  category: string;
  severity: string;
  body: string;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.file === "string" &&
    typeof candidate.line === "number" &&
    typeof candidate.category === "string" &&
    typeof candidate.body === "string" &&
    typeof candidate.severity === "string" &&
    SEVERITIES.has(candidate.severity)
  );
}

// Models frequently wrap JSON output in a markdown code fence even when
// explicitly told not to — strip one if present before parsing, rather than
// treating a cosmetic wrapper as a hard failure.
function stripMarkdownCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  return fenceMatch?.[1] ?? trimmed;
}

// Parses the model's raw text response into structured comments. Any
// deviation from the expected shape (invalid JSON, wrong top-level shape,
// a malformed comment) throws — review-service.ts treats that as this
// turn's failure, never something to propagate further.
export function parseReviewResponse(content: string): ReviewComment[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownCodeFence(content));
  } catch {
    throw new Error("LLM response is not valid JSON");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).comments)
  ) {
    throw new Error('LLM response does not match the expected { "comments": [...] } shape');
  }

  const rawComments = (parsed as { comments: unknown[] }).comments;

  return rawComments.map((raw, index) => {
    if (!isValidCommentShape(raw)) {
      throw new Error(`comment at index ${index} does not match the expected ReviewComment shape`);
    }
    return {
      file: raw.file,
      line: raw.line,
      category: raw.category,
      severity: raw.severity as ReviewComment["severity"],
      body: raw.body,
    };
  });
}
