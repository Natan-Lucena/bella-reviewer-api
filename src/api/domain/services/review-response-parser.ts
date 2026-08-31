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

// Mirrors the cap stated in review-prompt.ts — kept in sync manually since
// the prompt text is a string, not a value this module can import from.
const MAX_SUGGESTION_RANGE_LINES = 30;

function isValidCommentShape(value: unknown): value is {
  file: string;
  line: number;
  endLine: unknown;
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

// Resolves a safe endLine for one comment. Anything malformed (wrong type,
// non-integer, before `line`) or over the cap collapses to `line` rather
// than being rejected outright — the suggestedCode line-count check in
// resolveKindAndSuggestedCode then naturally catches the mismatch and
// degrades the comment to observation, so this never needs its own
// rejection path.
function resolveEndLine(line: number, rawEndLine: unknown): number {
  if (typeof rawEndLine !== "number" || !Number.isInteger(rawEndLine) || rawEndLine < line) {
    return line;
  }
  if (rawEndLine - line + 1 > MAX_SUGGESTION_RANGE_LINES) {
    return line;
  }
  return rawEndLine;
}

// Resolves kind/suggestedCode/endLine for one already-shape-valid comment.
// Returns null when the comment should be dropped entirely (unrecognized
// kind) — unlike the fields checked in isValidCommentShape, this never
// throws and never invalidates the rest of the response (see
// review-response-parser.spec.ts).
function resolveKindAndSuggestedCode(
  kind: unknown,
  suggestedCode: unknown,
  line: number,
  rawEndLine: unknown,
): { kind: CommentKind; suggestedCode: string | null; endLine: number } | null {
  if (!COMMENT_KINDS.has(kind as string)) {
    return null;
  }

  if (kind === "observation") {
    // Any suggestedCode/endLine the model redundantly included is dropped —
    // kind stays observation either way, and there is no suggestion range
    // to speak of.
    return { kind: "observation", suggestedCode: null, endLine: line };
  }

  const endLine = resolveEndLine(line, rawEndLine);
  const hasSuggestedCode = typeof suggestedCode === "string" && suggestedCode.trim().length > 0;

  if (!hasSuggestedCode) {
    return { kind: "observation", suggestedCode: null, endLine: line };
  }

  // GitHub only omits `start_line` for a single-line comment (endLine ===
  // line) — in that exact shape, a multi-line suggestedCode would replace
  // just the one anchored line with several, reproducing the configuration
  // that corrupted a real file once (see GithubScmAdapter.publishComment).
  // A genuine multi-line range (endLine > line) sends `start_line` too, so
  // GitHub is told the real range to replace — suggestedCode's own line
  // count is then free to differ from the range's (collapsing a block into
  // fewer lines, or expanding into more, is normal and expected), so no
  // count-matching is required there. Confirmed against real Gemini output:
  // enforcing an exact count match degraded nearly every real multi-line
  // suggestion to observation, since a good fix rarely has exactly as many
  // replacement lines as the code it replaces.
  const isMultiLineRange = endLine > line;
  const isSingleLineSuggestedCode = !(suggestedCode as string).includes("\n");

  if (!isMultiLineRange && !isSingleLineSuggestedCode) {
    return { kind: "observation", suggestedCode: null, endLine: line };
  }

  return { kind: "actionable", suggestedCode: suggestedCode as string, endLine };
}

// Models frequently wrap JSON output in a markdown code fence even when
// explicitly told not to — strip one if present before parsing, rather than
// treating a cosmetic wrapper as a hard failure.
export function stripMarkdownCodeFence(content: string): string {
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

    const resolved = resolveKindAndSuggestedCode(
      raw.kind,
      raw.suggestedCode,
      raw.line,
      raw.endLine,
    );
    if (!resolved) {
      return;
    }

    comments.push({
      file: raw.file,
      line: raw.line,
      endLine: resolved.endLine,
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
