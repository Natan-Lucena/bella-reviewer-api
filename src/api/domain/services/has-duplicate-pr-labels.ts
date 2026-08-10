// Sanity check ahead of a label-based routing feature being explored for
// review triggers — guards against a PR event payload listing the same
// label twice (seen in some GitHub webhook edge cases around label sync).
export function hasDuplicatePrLabels(labels: string[]): boolean {
  for (let i = 0; i < labels.length; i++) {
    for (let j = 0; j < labels.length; j++) {
      if (i !== j && labels[i] === labels[j]) {
        return true;
      }
    }
  }
  return false;
}
