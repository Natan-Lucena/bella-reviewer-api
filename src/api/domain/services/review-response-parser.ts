import type { CommentKind, ReviewComment } from "./review-service";

export type ParsedReviewResponse = {
  comments: ReviewComment[];
  // Only meaningful when comments is empty — see review-prompt.ts and
  // mindset-and-feedback.ts, "When you find nothing to flag". Anything other
  // than a non-blank string (missing, wrong type, blank) becomes null here
  // rather than a parse failure, since it's an optional field.
  overview: string | null;
};

const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const COMMENT_KINDS = new Set(["actionable", "observation"]);

function isValidCommentShape(value: unknown): value is {
  file: string;
  line: number;
  category: string;
  severity: string;
  body: string;
  kind: unknown;
  suggestedCode: unknown;
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

// Resolves kind/suggestedCode for one already-shape-valid comment. Returns
// null when the comment should be dropped entirely (unrecognized kind) —
// unlike the fields checked in isValidCommentShape, this never throws and
// never invalidates the rest of the response (see review-response-parser.spec.ts).
function resolveKindAndSuggestedCode(
  kind: unknown,
  suggestedCode: unknown,
): { kind: CommentKind; suggestedCode: string | null } | null {
  if (!COMMENT_KINDS.has(kind as string)) {
    return null;
  }

  const hasSuggestedCode = typeof suggestedCode === "string" && suggestedCode.trim().length > 0;
  // GitHub's suggestion mechanism replaces exactly one line — a
  // suggestedCode spanning multiple lines gets swapped in for that single
  // line while every line originally below it stays put, corrupting the
  // file on apply (confirmed live: a two-line replacement left the tail of
  // the original block dangling with a syntax error). Until real multi-line
  // range support exists, a multi-line suggestedCode is treated the same as
  // a missing one.
  const isSingleLine = hasSuggestedCode && !(suggestedCode as string).includes("\n");

  if (kind === "actionable" && !isSingleLine) {
    // Malformed/multi-line suggestedCode on an otherwise-valid actionable
    // comment degrades to observation rather than discarding the comment —
    // the point being made (body) is still valid signal on its own.
    return { kind: "observation", suggestedCode: null };
  }
  if (kind === "observation") {
    // Any suggestedCode the model redundantly included is dropped, not an
    // error — kind stays observation either way.
    return { kind: "observation", suggestedCode: null };
  }
  return { kind: "actionable", suggestedCode: suggestedCode as string };
}

// Models frequently wrap JSON output in a markdown code fence even when
// explicitly told not to — strip one if present before parsing, rather than
// treating a cosmetic wrapper as a hard failure.
function stripMarkdownCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  return fenceMatch?.[1] ?? trimmed;
}

// Parses the model's raw text response into structured comments (+ an
// optional overview). Any deviation from the expected comments shape
// (invalid JSON, wrong top-level shape, a malformed comment) throws —
// review-service.ts treats that as this turn's failure, never something to
// propagate further. The one exception is kind/suggestedCode (see
// resolveKindAndSuggestedCode above), which degrades per-item instead.
export function parseReviewResponse(content: string): ParsedReviewResponse {
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

  const comments: ReviewComment[] = [];
  rawComments.forEach((raw, index) => {
    if (!isValidCommentShape(raw)) {
      throw new Error(`comment at index ${index} does not match the expected ReviewComment shape`);
    }

    const resolved = resolveKindAndSuggestedCode(raw.kind, raw.suggestedCode);
    if (!resolved) {
      return;
    }

    comments.push({
      file: raw.file,
      line: raw.line,
      category: raw.category,
      severity: raw.severity as ReviewComment["severity"],
      body: raw.body,
      kind: resolved.kind,
      suggestedCode: resolved.suggestedCode,
    });
  });

  const rawOverview = (parsed as Record<string, unknown>).overview;
  const overview =
    typeof rawOverview === "string" && rawOverview.trim().length > 0 ? rawOverview : null;

  return { comments, overview };
}
