// Detects a distinct corruption risk from suggested-code-overlaps-boundary.ts:
// the model declaring a range (line/endLine) that points at a real block of
// code, but writing suggestedCode for a COMPLETELY DIFFERENT block elsewhere
// in the same file (e.g. declaring the range over one function's body while
// writing a full replacement for a different function several lines away).
// Applying such a suggestion literally corrupts the file — it overwrites
// the wrong block, while the block suggestedCode actually describes is left
// untouched (often duplicated) somewhere else.
//
// Confirmed live against real Gemini output: in a diff with many small,
// similarly-shaped functions, the model occasionally miscounts and produces
// a range/suggestedCode pair like this.
//
// Detection: a genuinely correct suggestion always keeps at least one
// meaningful line of the block it's actually replacing (even a full
// rewrite typically reuses a return statement, a captured variable name, a
// loop shape) — a suggestion sharing zero meaningful content with what's
// actually at the declared range is a strong, cheap signal that the range
// belongs to different code entirely. "Meaningful" excludes lines that are
// just punctuation (braces, semicolons) — those are common to almost any
// block and would make the check meaningless.
const TRIVIAL_LINE_PATTERN = /^[{}();,\s]*$/;

function meaningfulLines(lines: string[]): Set<string> {
  return new Set(
    lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !TRIVIAL_LINE_PATTERN.test(line)),
  );
}

// Below this many meaningful lines, a total rewrite sharing zero exact lines
// with the original is common and legitimate (e.g. a 2-line body fully
// restated to add a guard clause) — confirmed live: a real, safe suggestion
// for a 2-line range had zero line-level overlap with the original, since
// every line was rewritten. Zero overlap only becomes a reliable signal of
// "wrong block entirely" once the range is large enough that a genuine fix
// almost always leaves *something* — a variable name, an unrelated
// statement — untouched. All three confirmed real wrong-location cases had
// 3+ meaningful lines in their actual range.
const MIN_MEANINGFUL_LINES_TO_CHECK = 3;

export function suggestedCodeMismatchesActualRange(
  actualRangeLines: string[],
  suggestedCode: string,
): boolean {
  const actualMeaningful = meaningfulLines(actualRangeLines);
  if (actualMeaningful.size < MIN_MEANINGFUL_LINES_TO_CHECK) {
    return false;
  }

  const suggestedMeaningful = meaningfulLines(suggestedCode.split("\n"));
  for (const line of actualMeaningful) {
    if (suggestedMeaningful.has(line)) {
      return false;
    }
  }
  return true;
}
