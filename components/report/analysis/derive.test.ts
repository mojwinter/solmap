import { describe, expect, it } from 'vitest';
import { evaluate, recommend } from '@/lib/finance';
import { BC_SOLAR_YIELD, DEFAULT_INPUTS } from '@/src/config/bc';
import southGable from '@/fixtures/synthetic/south-gable.json';
import { trimBuilding } from '@/lib/solar/trim';
import type { SolarBuilding } from '@/lib/solar/schema';
import {
  billImpact,
  largestPayingIndex,
  lifetimeFigures,
  monthlyProduction,
  niceTicks,
  panelBars,
  peakIndex,
  roofFaces,
  sweep,
  weightedPitch,
} from './derive';

const building = trimBuilding(southGable as unknown as SolarBuilding, 'fixture');
const rec = recommend(building, DEFAULT_INPUTS);
const s = rec.scenarios[rec.recommendedIndex!];

describe('lifetimeFigures', () => {
  it('sums the projection and relates it to what you pay', () => {
    const f = lifetimeFigures(s);
    const energy = s.years.reduce((a, y) => a + y.productionKwh, 0);
    expect(f.energyKwh).toBeCloseTo(energy);
    // Gross savings less what you paid is the engine's lifetime net.
    expect(f.grossSavings - s.netCost).toBeCloseTo(s.lifetimeNetSavings);
    expect(f.costPerKwh).toBeCloseTo(s.netCost / energy);
    expect(f.returnPerDollar).toBeCloseTo(f.grossSavings / s.netCost);
    expect(f.selfUseShare).toBeGreaterThan(0);
    expect(f.selfUseShare).toBeLessThan(1);
  });

  it('has no cost per kWh or return when nothing is made or paid', () => {
    const f = lifetimeFigures({ years: [], netCost: 0 });
    expect(f.costPerKwh).toBeNull();
    expect(f.returnPerDollar).toBeNull();
  });
});

describe('billImpact', () => {
  it('walks from the bill without solar to what is left, and the steps add up', () => {
    const b = billImpact(s);
    expect(b.before).toBeCloseTo(s.billWithoutSolarYear1);
    expect(b.afterSelfUse).toBeCloseTo(b.before - s.year1.selfUsedValue);
    expect(b.net).toBeCloseTo(b.afterSelfUse - b.exportCredit);
    expect(b.cut).toBeCloseTo(s.year1.total / b.before);
    // The solar you use replaces your tiered rate: between tier 1 and tier 2 (11.87–14.08¢).
    expect(b.avoidedRatePerKwh!).toBeGreaterThan(0.1187 - 1e-9);
    expect(b.avoidedRatePerKwh!).toBeLessThan(0.1408 + 1e-9);
  });
});

describe('sweep', () => {
  const points = sweep(rec.scenarios);

  it('has one point per config, in order', () => {
    expect(points).toHaveLength(building.configs.length);
    points.forEach((p, i) => {
      expect(p.index).toBe(i);
      expect(p.panels).toBe(building.configs[i].panelsCount);
    });
  });

  it("peaks in today's dollars at the recommended size on the hero roof", () => {
    expect(peakIndex(points, 'npv')).toBe(rec.recommendedIndex);
    // Plain dollars keep climbing a little past it (the rebate cap is what the discounted view shows).
    expect(points[peakIndex(points, 'net')!].panels).toBeGreaterThan(points[rec.recommendedIndex!].panels);
  });

  it('finds the largest size that still pays back', () => {
    const last = largestPayingIndex(points)!;
    expect(points[last].payback).not.toBeNull();
    expect(points.slice(last + 1).every((p) => p.payback === null)).toBe(true);
    expect(largestPayingIndex(points.map((p) => ({ ...p, payback: null })))).toBeNull();
  });

  it('export share grows with size', () => {
    expect(points[points.length - 1].exportShare).toBeGreaterThan(points[0].exportShare);
  });
});

describe('panelBars', () => {
  it('scales each panel to the scenario’s AC basis and marks the ones in use', () => {
    const bars = panelBars(building, s);
    expect(bars).toHaveLength(building.panels.length);
    expect(bars.filter((b) => b.used)).toHaveLength(s.panelsCount);
    const used = bars.filter((b) => b.used).reduce((a, b) => a + b.kwh, 0);
    expect(used).toBeCloseTo(s.acKwhYear1, 0);
  });
});

describe('roofFaces', () => {
  it('lists every face, largest first, with the panels this size puts on each', () => {
    const faces = roofFaces(building, s);
    expect(faces).toHaveLength(building.segments.length);
    for (let i = 1; i < faces.length; i++) expect(faces[i - 1].areaM2).toBeGreaterThanOrEqual(faces[i].areaM2);
    expect(faces.reduce((a, f) => a + f.panelsUsed, 0)).toBe(s.panelsCount);
    expect(faces.reduce((a, f) => a + f.panelsMax, 0)).toBe(building.panels.length);
    expect(faces.reduce((a, f) => a + f.kwhUsed, 0)).toBeCloseTo(s.acKwhYear1, 0);
  });

  it('shows the roof alone when nothing fits', () => {
    const faces = roofFaces(building, null);
    expect(faces.every((f) => f.panelsUsed === 0 && f.kwhUsed === 0)).toBe(true);
  });
});

describe('monthlyProduction', () => {
  const vancouver = BC_SOLAR_YIELD.towns.find((t) => t.name === 'Vancouver')!;

  it('sums to the year and peaks in summer', () => {
    const months = monthlyProduction(4800, vancouver, 30);
    expect(months).toHaveLength(12);
    expect(months.reduce((a, m) => a + m.kwh, 0)).toBeCloseTo(4800);
    const july = months[6].kwh;
    const december = months[11].kwh;
    expect(july).toBeGreaterThan(3 * december);
  });

  it('a flat roof has a sharper winter dip than a pitched one', () => {
    const flat = monthlyProduction(1000, vancouver, 0);
    const pitched = monthlyProduction(1000, vancouver, 30);
    expect(flat[11].kwh).toBeLessThan(pitched[11].kwh);
  });

  it('every town’s monthly columns add up to its annual values (±rounding)', () => {
    for (const t of BC_SOLAR_YIELD.towns) {
      expect(Math.abs(t.southMonthly.reduce((a, b) => a + b, 0) - t.south)).toBeLessThanOrEqual(6);
      expect(Math.abs(t.flatMonthly.reduce((a, b) => a + b, 0) - t.flat)).toBeLessThanOrEqual(6);
    }
  });
});

describe('weightedPitch', () => {
  it('is the pitch of the faces in use, weighted by output', () => {
    const p = weightedPitch(building, s);
    const pitches = building.segments.map((x) => x.pitchDegrees);
    expect(p).toBeGreaterThanOrEqual(Math.min(...pitches));
    expect(p).toBeLessThanOrEqual(Math.max(...pitches));
  });
});

describe('niceTicks', () => {
  it('spans the range in round steps', () => {
    expect(niceTicks(0, 10000)).toEqual([0, 2500, 5000, 7500, 10000]);
    expect(niceTicks(-7200, 10131)).toEqual([-10000, -5000, 0, 5000, 10000, 15000]);
    expect(niceTicks(1.6, 21.2, 5)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(niceTicks(3, 3)).toEqual([3]);
  });
});

it('scenario helpers agree with a single evaluate()', () => {
  const one = evaluate(building.configs[0], 0, building.panel.capacityWatts, DEFAULT_INPUTS);
  expect(sweep([one])[0].net).toBeCloseTo(one.lifetimeNetSavings);
});
