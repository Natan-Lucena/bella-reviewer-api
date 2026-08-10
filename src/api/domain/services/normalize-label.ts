// Normalizes a PR label for case-insensitive comparison — continuing the
// label-based routing prep work.
export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}
