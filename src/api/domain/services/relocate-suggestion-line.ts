export type SuggestionLineAnchor = {
  line: number;
  contextBefore: string | null;
  contextAfter: string | null;
};

// Finds where `anchor.line` really is in `lines` (the file's current
// content, split by "\n") — the line number recorded when the suggestion
// was generated only stays accurate if nothing above it, in the same file,
// changed since. Returns a 0-based index, or null when the position can't
// be determined with confidence (prefer "don't know" over a wrong guess —
// this feeds a metric, not a user-facing action).
//
// No context captured at generation time (edge of file/hunk, or a comment
// created before this field existed) — nothing to relocate with, fall back
// to the original line exactly as reconciliation always did.
export function relocateSuggestionLine(
  lines: string[],
  anchor: SuggestionLineAnchor,
): number | null {
  const originalIndex = anchor.line - 1;

  if (anchor.contextBefore === null && anchor.contextAfter === null) {
    return originalIndex;
  }

  if (matchesContext(lines, originalIndex, anchor)) {
    return originalIndex;
  }

  const candidates: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (matchesContext(lines, i, anchor)) {
      candidates.push(i);
    }
  }

  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

function matchesContext(lines: string[], index: number, anchor: SuggestionLineAnchor): boolean {
  if (
    anchor.contextBefore !== null &&
    (lines[index - 1] ?? "").trim() !== anchor.contextBefore.trim()
  ) {
    return false;
  }
  if (
    anchor.contextAfter !== null &&
    (lines[index + 1] ?? "").trim() !== anchor.contextAfter.trim()
  ) {
    return false;
  }
  return true;
}
