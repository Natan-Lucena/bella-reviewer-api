// Detects a specific corruption risk: a multi-line suggestedCode that
// re-includes the line immediately before or after the declared range
// (contextBefore/contextAfter) somewhere in its own text. Applying such a
// suggestion literally — GitHub deletes only the declared range and inserts
// suggestedCode in its place — leaves the original neighbor line untouched
// while suggestedCode brings its own copy of that same line, producing a
// duplicate (e.g. two function signatures, or a redeclared variable).
//
// Confirmed live against real Gemini output: the model reliably identifies
// the right code block to fix, but doesn't always keep "line"/"endLine"
// (the range it declares) in sync with "suggestedCode" (the replacement
// text it writes) — sometimes the text covers a wider block (e.g. the
// whole function) than the range it declared (e.g. just the body).
//
// Checks every line of suggestedCode, not just its first/last line —
// a wider-than-declared suggestion can echo the boundary line anywhere
// near its own edge, not necessarily as the literal first/last line
// (e.g. a boundary line preceded by a blank line the model added).
export function suggestedCodeOverlapsBoundary(
  suggestedCode: string,
  contextBefore: string | null,
  contextAfter: string | null,
): boolean {
  const lines = suggestedCode.split("\n").map((line) => line.trim());

  if (contextBefore !== null && lines.includes(contextBefore.trim())) {
    return true;
  }
  if (contextAfter !== null && lines.includes(contextAfter.trim())) {
    return true;
  }
  return false;
}
