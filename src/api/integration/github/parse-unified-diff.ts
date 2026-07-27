import { DiffHunk } from "../../domain/ports/scm-adapter.port";

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// Parses one file's `patch` field from GitHub's pulls/:number/files response —
// just the hunks (no `--- a/...`/`+++ b/...` file headers, those aren't part
// of that per-file format) — into structured hunks/lines. Isolated as a pure
// function (no I/O) since tracking the old/new line counters across hunks is
// the highest-risk part of this integration.
//
// `lineNumber` always means "position in the NEW file" (per ScmAdapterPort):
// for "added"/"unchanged" lines that's their actual new-file line; a "removed"
// line has no new-file line of its own, so it gets the new-file position it
// was removed in front of. GitHub's line-comment API only accepts comments on
// added/unchanged lines anyway, so callers should never post against a
// "removed" line's lineNumber.
export function parseUnifiedDiffPatch(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of patch.split("\n")) {
    const header = HUNK_HEADER.exec(rawLine);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      currentHunk = { oldStartLine: oldLine, newStartLine: newLine, lines: [] };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      // Malformed patch (content before any hunk header) — nothing to attach it to.
      continue;
    }

    if (rawLine.startsWith("+")) {
      currentHunk.lines.push({ content: rawLine.slice(1), status: "added", lineNumber: newLine });
      newLine++;
    } else if (rawLine.startsWith("-")) {
      currentHunk.lines.push({ content: rawLine.slice(1), status: "removed", lineNumber: newLine });
      oldLine++;
    } else if (rawLine.startsWith(" ")) {
      currentHunk.lines.push({
        content: rawLine.slice(1),
        status: "unchanged",
        lineNumber: newLine,
      });
      oldLine++;
      newLine++;
    }
    // A "\ No newline at end of file" marker carries no content and doesn't
    // advance either counter — anything else falls through and is skipped.
  }

  return hunks;
}
