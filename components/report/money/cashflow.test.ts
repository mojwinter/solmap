import { describe, expect, it } from 'vitest';
import { cashFlowPoints, cashFlowTicks } from './cashflow';

const rows = (cumulatives: number[]) => cumulatives.map((cumulative, i) => ({ year: i + 1, cumulative }));

describe('cashFlowPoints', () => {
  it('starts at −netCost in year 0', () => {
    const points = cashFlowPoints({ netCost: 10000, years: rows([-8000, -6000]) });
    expect(points.map((p) => [p.year, p.cumulative])).toEqual([
      [0, -10000],
      [1, -8000],
      [2, -6000],
    ]);
    expect(points.every((p) => p.above === null)).toBe(true);
  });

  it('adds the exact zero crossing so both series meet there', () => {
    const points = cashFlowPoints({ netCost: 3000, years: rows([-1000, 1000, 3000]) });
    const crossing = points.find((p) => p.cumulative === 0)!;
    expect(crossing.year).toBeCloseTo(1.5);
    expect(crossing.below).toBe(0);
    expect(crossing.above).toBe(0);
    expect(points.filter((p) => p.below !== null).map((p) => p.year)).toEqual([0, 1, 1.5]);
    expect(points.filter((p) => p.above !== null).map((p) => p.year)).toEqual([1.5, 2, 3]);
  });

  it('does not duplicate a year that lands exactly on zero', () => {
    const points = cashFlowPoints({ netCost: 2000, years: rows([-1000, 0, 1000]) });
    expect(points.map((p) => p.year)).toEqual([0, 1, 2, 3]);
  });
});

describe('cashFlowTicks', () => {
  it('spans zero and every value in round steps', () => {
    const ticks = cashFlowTicks([{ cumulative: -14000 }, { cumulative: 23000 }]);
    expect(ticks[0]).toBeLessThanOrEqual(-14000);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(23000);
    expect(ticks).toContain(0);
    expect(ticks).toEqual([-20000, -10000, 0, 10000, 20000, 30000]);
  });

  it('includes zero when everything is negative', () => {
    const ticks = cashFlowTicks([{ cumulative: -12000 }, { cumulative: -3000 }]);
    expect(ticks.at(-1)).toBe(0);
    expect(ticks[0]).toBeLessThanOrEqual(-12000);
  });

  it('keeps whole-dollar, distinct ticks for tiny ranges', () => {
    expect(cashFlowTicks([{ cumulative: 0 }, { cumulative: 2 }])).toEqual([0, 1, 2]);
    // raw step 2.25 would round to 2.5: skip it for a whole-dollar 5.
    expect(cashFlowTicks([{ cumulative: 0 }, { cumulative: 9 }])).toEqual([0, 5, 10]);
  });

  it('has no float drift on fractional multipliers', () => {
    const ticks = cashFlowTicks([{ cumulative: -9000 }, { cumulative: 0 }]);
    expect(ticks).toEqual([-10000, -7500, -5000, -2500, 0]);
  });
});
