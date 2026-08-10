import { Diff, DiffLine } from "../ports/scm-adapter.port";

export type SuggestionContext = {
  contextBefore: string | null;
  contextAfter: string | null;
};

// Captures the diff line immediately before `line` and immediately after
// `endLine`, within the same hunk — anchoring the whole suggestion range,
// not just one line — used to relocate a suggestion later if unrelated
// edits shift the file (see reconcile-suggestion-applications.ts,
// relocate-suggestion-line.ts). `endLine` defaults to `line`, so a
// single-line suggestion behaves exactly as before this parameter existed.
//
// Never crosses a hunk boundary: a hunk's first/last line may have no
// adjacent line in the Diff at all (GitHub only includes whatever context it
// put in the patch, commonly ~3 lines but not guaranteed) — that case
// legitimately returns null, not a guess. Both `line` and `endLine` must
// resolve within the same hunk; if either doesn't, the whole range is
// treated as not found (no partial context from mismatched hunks).
//
// Skips "removed" neighbors on purpose: a removed line's `lineNumber` is an
// insertion-point placeholder (shared with the next added/unchanged line),
// not a real position of its own — using its content as an anchor would
// search for a line that never existed in the new file.
export function extractSuggestionContext(
  diff: Diff,
  file: string,
  line: number,
  endLine: number = line,
): SuggestionContext {
  const diffFile = diff.files.find((f) => f.path === file);
  if (!diffFile) {
    return { contextBefore: null, contextAfter: null };
  }

  for (const hunk of diffFile.hunks) {
    const startIndex = hunk.lines.findIndex((l) => l.status !== "removed" && l.lineNumber === line);
    const endIndex = hunk.lines.findIndex(
      (l) => l.status !== "removed" && l.lineNumber === endLine,
    );
    if (startIndex === -1 || endIndex === -1) {
      continue;
    }

    return {
      contextBefore: findNearestNonRemoved(hunk.lines, startIndex, -1),
      contextAfter: findNearestNonRemoved(hunk.lines, endIndex, 1),
    };
  }

  return { contextBefore: null, contextAfter: null };
}

function findNearestNonRemoved(lines: DiffLine[], fromIndex: number, step: -1 | 1): string | null {
  for (let i = fromIndex + step; i >= 0 && i < lines.length; i += step) {
    const candidate = lines[i];
    if (candidate && candidate.status !== "removed") {
      return candidate.content;
    }
  }
  return null;
}
