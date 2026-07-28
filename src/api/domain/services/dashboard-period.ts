export type DashboardPeriod = "7d" | "30d" | "90d";

const PERIOD_DAYS: Record<DashboardPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export type PeriodRange = {
  currentFrom: Date;
  currentTo: Date;
  previousFrom: Date;
  previousTo: Date;
};

// The current window is [now - N days, now); the comparison window is the
// same size, immediately before it: [now - 2N days, now - N days).
export function getPeriodRange(period: DashboardPeriod, now: Date): PeriodRange {
  const days = PERIOD_DAYS[period];
  const msPerDay = 24 * 60 * 60 * 1000;

  const currentTo = now;
  const currentFrom = new Date(now.getTime() - days * msPerDay);
  const previousTo = currentFrom;
  const previousFrom = new Date(currentFrom.getTime() - days * msPerDay);

  return { currentFrom, currentTo, previousFrom, previousTo };
}

// Percentage change from `previous` to `current`. Undefined when there's no
// baseline to compare against (previous = 0) — a 0-to-N change isn't a
// meaningful percentage, it's a new trend starting from nothing.
export function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}
