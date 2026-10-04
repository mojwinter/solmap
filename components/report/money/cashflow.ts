import { signedCad } from '@/lib/format';
import type { ScenarioResult } from '@/src/types/app';

/**
 * Cumulative cash-flow points for #30. `years[]` holds end-of-year rows 1…N, so year 0 (−netCost, the
 * day it's installed) is prepended here. The zero crossing is added as its own point at the exact
 * `paybackYears` (the same linear interpolation lib/finance/project.ts uses), and the values are split
 * into `below` and `above` so the chart can wash the loss red and the gain green, meeting at zero.
 */
export interface CashFlowPoint {
  /** Years since install (fractional for the crossing point). */
  t: number;
  /** Calendar year: startYear + t. */
  year: number;
  cumulative: number;
  below: number | null;
  above: number | null;
  breakEven?: true;
}

export function cashFlowPoints(
  scenario: Pick<ScenarioResult, 'netCost' | 'years' | 'paybackYears'>,
  startYear: number,
): CashFlowPoint[] {
  const raw = [{ t: 0, cumulative: -scenario.netCost }, ...scenario.years.map((r) => ({ t: r.year, cumulative: r.cumulative }))];
  const point = (t: number, cumulative: number, breakEven?: true): CashFlowPoint => ({
    t,
    year: startYear + t,
    cumulative,
    below: cumulative <= 0 ? cumulative : null,
    above: cumulative >= 0 ? cumulative : null,
    ...(breakEven && { breakEven }),
  });

  const points: CashFlowPoint[] = [];
  const crossing = scenario.paybackYears;
  for (const r of raw) {
    // Insert the crossing between the two rows it falls between (not on a row that's already exactly 0).
    if (crossing !== null && crossing > 0 && points.length > 0 && points[points.length - 1].t < crossing && r.t > crossing) {
      points.push(point(crossing, 0, true));
    }
    points.push(point(r.t, r.cumulative));
  }
  return points;
}

/**
 * One sentence above the chart (CLAUDE.md rule 6). "Pays for itself in 2037, then +$9,840 by 2051." /
 * "Still −$4,602 after 25 years: it doesn't pay back within the panels' lifetime."
 */
export function cashFlowSummary(
  scenario: Pick<ScenarioResult, 'paybackYears' | 'lifetimeNetSavings'>,
  startYear: number,
  lifetimeYears: number,
): string {
  const end = signedCad(scenario.lifetimeNetSavings);
  if (scenario.paybackYears === null) {
    return `Still ${end} after ${lifetimeYears} years: it doesn't pay back within the panels' lifetime.`;
  }
  return `Pays for itself in ${startYear + Math.round(scenario.paybackYears)}, then ${end} by ${startYear + lifetimeYears}.`;
}
