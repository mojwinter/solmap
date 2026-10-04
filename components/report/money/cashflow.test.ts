import { describe, expect, it } from 'vitest';
import type { YearRow } from '@/src/types/app';
import { cashFlowPoints, cashFlowSummary } from './cashflow';

const rows = (cumulative: number[]): YearRow[] =>
  cumulative.map((c, i) => ({ year: i + 1, productionKwh: 0, selfUsedKwh: 0, exportedKwh: 0, savings: 0, cumulative: c }));

describe('cashFlowPoints', () => {
  it('prepends year 0 at −netCost and adds the exact crossing', () => {
    const pts = cashFlowPoints({ netCost: 1000, years: rows([-600, -200, 200, 600]), paybackYears: 2.5 }, 2026);
    expect(pts.map((p) => p.t)).toEqual([0, 1, 2, 2.5, 3, 4]);
    expect(pts[0]).toMatchObject({ year: 2026, cumulative: -1000, below: -1000, above: null });
    expect(pts[3]).toEqual({ t: 2.5, year: 2028.5, cumulative: 0, below: 0, above: 0, breakEven: true });
    expect(pts[4]).toMatchObject({ below: null, above: 200 });
  });

  it('has no crossing when it never pays back', () => {
    const pts = cashFlowPoints({ netCost: 1000, years: rows([-800, -600]), paybackYears: null }, 2026);
    expect(pts.some((p) => p.breakEven)).toBe(false);
    expect(pts.every((p) => p.above === null)).toBe(true);
  });

  it("doesn't duplicate a crossing that lands exactly on a year", () => {
    const pts = cashFlowPoints({ netCost: 1000, years: rows([-500, 0, 500]), paybackYears: 2 }, 2026);
    expect(pts.map((p) => p.t)).toEqual([0, 1, 2, 3]);
    expect(pts[2]).toMatchObject({ below: 0, above: 0 });
  });
});

describe('cashFlowSummary', () => {
  it('names the payback year and the end total', () => {
    expect(cashFlowSummary({ paybackYears: 11.4, lifetimeNetSavings: 9840.2 }, 2026, 25)).toBe(
      'Pays for itself in 2037, then +$9,840 by 2051.',
    );
  });

  it('says plainly when it never pays back', () => {
    expect(cashFlowSummary({ paybackYears: null, lifetimeNetSavings: -4602 }, 2026, 25)).toBe(
      "Still −$4,602 after 25 years: it doesn't pay back within the panels' lifetime.",
    );
  });
});
