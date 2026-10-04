import { cents, kw } from '@/lib/format';
import type { ScenarioResult } from '@/src/types/app';

/** One point per config for the sweet-spot chart (#27). `payback` null = never within the panels' life. */
export interface SweetSpotPoint {
  index: number;
  kw: number;
  panels: number;
  npv: number;
  payback: number | null;
}

export const sweetSpotPoints = (scenarios: readonly ScenarioResult[]): SweetSpotPoint[] =>
  scenarios.map((s, index) => ({ index, kw: s.systemKwDc, panels: s.panelsCount, npv: s.npv, payback: s.paybackYears }));

/** Index of the highest NPV (the first one, on a tie), or null with no points. */
export function peakIndex(points: readonly SweetSpotPoint[]): number | null {
  let best: number | null = null;
  for (const p of points) if (best === null || p.npv > points[best].npv) best = p.index;
  return best;
}

/**
 * Smallest size above the peak from which no bigger size pays back within the panels' life, or null
 * when the largest size still pays back.
 */
export function neverPaysFrom(points: readonly SweetSpotPoint[]): SweetSpotPoint | null {
  let from: SweetSpotPoint | null = null;
  for (let i = points.length - 1; i >= 0 && points[i].payback === null; i--) from = points[i];
  return from;
}

/**
 * The chart's one-sentence takeaway (CLAUDE.md rule 6: plain, and honest when nothing pays).
 * "Value tops out around 4.8 kW. Bigger systems sell more of their power back at 10¢, so each extra panel earns less."
 * Anchored on the recommended size when there is one: recommend() picks the smallest size within a few
 * dollars of the best NPV, so naming the strict peak would contradict the star on the slider.
 */
export function sweetSpotSummary(
  points: readonly SweetSpotPoint[],
  exportRate: number,
  lifetimeYears: number,
  recommendedIndex: number | null = null,
): string {
  const best = peakIndex(points);
  if (best === null) return '';
  if (points[best].npv <= 0) {
    return `No size comes out ahead in today's dollars over ${lifetimeYears} years.`;
  }
  const peak = recommendedIndex !== null && points[recommendedIndex] ? recommendedIndex : best;
  const parts = [`Value tops out around ${kw(points[peak].kw)} kW.`];
  if (best < points.length - 1) {
    parts.push(`Bigger systems sell more of their power back at ${cents(exportRate)}, so each extra panel earns less.`);
  }
  const never = neverPaysFrom(points);
  if (never && never.index > peak) parts.push(`From ${kw(never.kw)} kW up it never pays back within ${lifetimeYears} years.`);
  return parts.join(' ');
}
