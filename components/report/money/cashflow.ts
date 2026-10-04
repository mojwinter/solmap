// Pure data for the cash-flow chart: ScenarioResult → points the chart draws. No React.
import type { YearRow } from '@/src/types/app';

export interface CashFlowPoint {
  /** Years after install: 0 = install day, fractional only at a zero crossing. */
  year: number;
  /** Cumulative net savings at that point (CAD); starts at −netCost. */
  cumulative: number;
  /** `cumulative` while at or below zero, else null: the red series. */
  below: number | null;
  /** `cumulative` while at or above zero, else null: the green series. */
  above: number | null;
}

const point = (year: number, cumulative: number): CashFlowPoint => ({
  year,
  cumulative,
  below: cumulative <= 0 ? cumulative : null,
  above: cumulative >= 0 ? cumulative : null,
});

/**
 * Years 0…N of cumulative net savings. `years[]` holds end-of-year rows from year 1, so year 0
 * (−netCost) is prepended. Wherever the line crosses zero, the exact crossing is added (linear,
 * the same interpolation lib/finance uses for `paybackYears`), so the red and green series meet
 * at zero instead of leaving a gap between two whole years.
 */
export function cashFlowPoints(scenario: {
  netCost: number;
  years: readonly Pick<YearRow, 'year' | 'cumulative'>[];
}): CashFlowPoint[] {
  const points = [point(0, -scenario.netCost)];
  for (const row of scenario.years) {
    const prev = points[points.length - 1];
    if ((prev.cumulative < 0 && row.cumulative > 0) || (prev.cumulative > 0 && row.cumulative < 0)) {
      const t = -prev.cumulative / (row.cumulative - prev.cumulative);
      points.push(point(prev.year + t * (row.year - prev.year), 0));
    }
    points.push(point(row.year, row.cumulative));
  }
  return points;
}

/**
 * Round, readable y-axis ticks spanning zero and every point (about four steps). Steps are whole
 * dollars, and each tick is `i * step` (not a running sum), so ticks are exact and never repeat.
 */
export function cashFlowTicks(points: Pick<CashFlowPoint, 'cumulative'>[]): number[] {
  const values = points.map((p) => p.cumulative);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  if (hi === lo) return [0];
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw && Number.isInteger(m * mag)) ?? 10) * mag;
  const first = Math.floor(lo / step);
  const last = Math.ceil(hi / step);
  return Array.from({ length: last - first + 1 }, (_, i) => (first + i) * step);
}
