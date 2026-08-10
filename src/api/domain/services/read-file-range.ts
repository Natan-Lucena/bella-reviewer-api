// Reads and normalizes a contiguous block of `lineCount` lines starting at
// `startIndex` from a file's lines — the counterpart, on the "actual file
// content" side, to a Comment's suggestedCode on the "expected" side (see
// reconcile-suggestion-applications.ts / reconcile-thread-resolution-use-case.ts,
// both of which compare the two). Returns null when the range runs past the
// end of the file — a comment whose suggestion no longer fits is unrelated
// to whether its content matches, so callers treat that as its own outcome
// (typically "superseded"), not a mismatch.
export function readFileRange(
  lines: string[],
  startIndex: number,
  lineCount: number,
): string | null {
  if (startIndex < 0 || startIndex + lineCount > lines.length) {
    return null;
  }
  return normalizeMultilineCode(lines.slice(startIndex, startIndex + lineCount).join("\n"));
}

// Trims each line individually before joining, not the block as a whole —
// trimming the whole block only strips leading/trailing whitespace at the
// very start/end, leaving interior indentation drift (e.g. a suggestion
// authored with different leading whitespace than what's actually in the
// file) to cause false mismatches otherwise. Applied to both sides of every
// comparison — the actual file range (via readFileRange) and the expected
// suggestedCode — so neither side gets an unfair normalization advantage.
export function normalizeMultilineCode(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
}
