import { CostByModelEntry } from "../repository/review-run.repository";

// Combines two arrays of CostByModelEntry (e.g. from ReviewRun-sourced and
// CommentReply-sourced aggregation) into one, keyed by `${provider}:${model}`.
// A pair present in only one source passes through unchanged. A pair present
// in both sums totalCost/count, and takes the min of firstUsedAt / max of
// lastUsedAt across the two.
export function mergeCostByModel(a: CostByModelEntry[], b: CostByModelEntry[]): CostByModelEntry[] {
  const merged = new Map<string, CostByModelEntry>();

  for (const entry of [...a, ...b]) {
    const key = `${entry.provider}:${entry.model}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
      continue;
    }

    merged.set(key, {
      provider: entry.provider,
      model: entry.model,
      totalCost: existing.totalCost + entry.totalCost,
      count: existing.count + entry.count,
      firstUsedAt: existing.firstUsedAt < entry.firstUsedAt ? existing.firstUsedAt : entry.firstUsedAt,
      lastUsedAt: existing.lastUsedAt > entry.lastUsedAt ? existing.lastUsedAt : entry.lastUsedAt,
    });
  }

  return [...merged.values()].sort((x, y) => y.totalCost - x.totalCost);
}
