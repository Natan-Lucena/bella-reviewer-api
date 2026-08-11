import { Diff } from "../ports/scm-adapter.port";

// Reads the actual current lines within [line, endLine] (inclusive) from the
// diff — the counterpart to extract-suggestion-context.ts, which reads the
// neighbors just outside the range instead of the range's own content.
// Returns null when the range can't be found as a single contiguous span
// within one hunk (same reasoning as extract-suggestion-context.ts: no
// partial/guessed result from mismatched hunks).
//
// Skips "removed" lines for the same reason extract-suggestion-context.ts
// does: they're insertion-point placeholders in the new file, not real
// content of it.
export function extractRangeContent(
  diff: Diff,
  file: string,
  line: number,
  endLine: number,
): string[] | null {
  const diffFile = diff.files.find((f) => f.path === file);
  if (!diffFile) {
    return null;
  }

  for (const hunk of diffFile.hunks) {
    const startIndex = hunk.lines.findIndex((l) => l.status !== "removed" && l.lineNumber === line);
    const endIndex = hunk.lines.findIndex(
      (l) => l.status !== "removed" && l.lineNumber === endLine,
    );
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      continue;
    }

    return hunk.lines
      .slice(startIndex, endIndex + 1)
      .filter((l) => l.status !== "removed")
      .map((l) => l.content);
  }

  return null;
}
